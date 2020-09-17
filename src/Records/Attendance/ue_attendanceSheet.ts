/**
 * @NScriptName  UserEvent | AttendanceSheet
 * @NApiVersion  2.0
 * @NScriptType  UserEventScript
 * @NModuleScope SameAccount
 */

import { EntryPoints } from 'N/types';
import * as record from 'N/record';
import * as search from 'N/search';
import * as file from 'N/file';
import * as format from 'N/format';
import * as runtime from 'N/runtime';
import * as error from 'N/error';
import * as log from 'N/log';
import { Model, ApprovalStatus } from '../helpers';
import { AttendanceSheet, AttendanceSheetField } from './AttendanceSheet';
import { Permission, PermissionField } from '../Permission/Permission';


export function beforeSubmit(context: EntryPoints.UserEvent.beforeSubmitContext) {
    let attendance = new AttendanceSheet().createFromRecord(context.newRecord);
    let fileID = Number(attendance.getField(AttendanceSheetField.FILE).value);
    let attendanceFile = file.load({ id: fileID });
    let fileContent = attendanceFile.getContents();    // Getting the inside data
    let attendanceData = getAttendancePeriod(fileContent, attendance);
    saveEmpAttendance(attendanceData, attendance);
}


// ========================== [ Operations Functions ] =========================

function getAttendancePeriod(csvFileContent, attendanceSheet: AttendanceSheet) {
    let recordDate = new Date(attendanceSheet.getField(AttendanceSheetField.DATE).value.toString());
    let fileRows = csvFileContent.split('\r\n');
    // CSV File Columns
    let headers = fileRows[0].split(',');
    let empNameIndex: number = headers.indexOf(attendanceSheet.empNameHeader);
    let empMachineIDIndex: number = headers.indexOf(attendanceSheet.machineIDHeader);
    let timeIndex: number = headers.indexOf(attendanceSheet.timeHeader);
    let stateIndex: number = headers.indexOf(attendanceSheet.stateHeader);
    /**
     * @example
     *  {
     *      "empFingerprintId": {
     *          name: '',
     *          id: '',
     *          checkIn: "time",
     *          checkOut: "time",
     *          workHours: "number",
     *          notes: "sting",
     *      },  ...
     *  }
     */
    let attendanceData = {};

    for (let i = 1; i < fileRows.length; i++) {
        let empData = fileRows[i].split(',');
        let empMachineID = empData[empMachineIDIndex];

        if (empMachineID) {            // Checking this Row has a record
            let empName: string = empData[empNameIndex];
            let empAttState: string = empData[stateIndex];
            let empAttDate = new Date(empData[timeIndex]);


            // Check if the current row date is the record date, else ignore this row.
            if (recordDate.getDate() != empAttDate.getDate() || recordDate.getMonth() != empAttDate.getMonth()
                || recordDate.getFullYear() != empAttDate.getFullYear()) {
                continue;
            }

            if (empAttState == attendanceSheet.checkInString) {  // Check-In    
                if (!attendanceData[empMachineID]) {
                    attendanceData[empMachineID] = {
                        name: empName,
                        id: empMachineID,
                        checkIn: (empAttDate)
                    };
                    let maxStartDate = new Date(recordDate.getTime());
                    let maxCheckInTime = maxStartDate.setHours(9);
                    let delay = empAttDate.getTime() - maxCheckInTime;
                    attendanceData[empMachineID]["notes"] = (delay > 0) ? `• Delayed with ${Model.millisecondsToHuman(delay).minutes} mins.` : "";
                }   //? Add here in case checkOut is before checkIn
            } else if (empAttState == attendanceSheet.checkOutString) {  // Check-Out
                if (!attendanceData[empMachineID]) {
                    attendanceData[empMachineID] = {
                        name: empName,
                        id: empMachineID,
                        checkOut: (empAttDate)
                    };
                } else {
                    attendanceData[empMachineID]["checkOut"] = empAttDate;
                }
                attendanceData[empMachineID]["notes"] = attendanceData[empMachineID]["notes"] || "";
            }
        }
    }
    let calculatedAttData = calculateWorkingHours(attendanceData, recordDate);
    return calculatedAttData;
}


function calculateWorkingHours(attendanceData: {}, recordDate) {
    Object.keys(attendanceData).forEach(empID => {
        let empData = attendanceData[empID];
        if (!empData.checkIn) {
            empData["notes"] += "• Missing Check-In";
        } else if (!empData.checkOut) {
            empData["notes"] += "• Missing Check-Out";
        } else if (empData.checkIn && empData.checkOut) {
            let sysStartDate = new Date(recordDate.getTime());
            let sysStartTime = sysStartDate.setHours(7);
            let checkIn_sysTime = (sysStartTime > new Date(empData.checkIn).getTime()) ? sysStartDate : new Date(empData.checkIn);
            //Calculating Working Hours
            let workPeriodInMS = new Date(empData.checkOut).getTime() - checkIn_sysTime.getTime();
            if (Model.millisecondsToHuman(workPeriodInMS).days >= 1) {
                // Missing Check-Out
                empData["notes"] += "• Missing Check-Out";
            } else {
                let workPeriod = Model.millisecondsToHHMMSS(workPeriodInMS, true);
                empData['workHours'] = workPeriod
            }
        }
    });

    return attendanceData;
}


function saveEmpAttendance(attendanceData: {}, attendanceSheet: AttendanceSheet) {
    // let employees = new Employee().find(['custentity_emp_attendance_machine_id']);
    const recordDate = attendanceSheet.getField(AttendanceSheetField.DATE).value;
    const officialWorkingHours = Model.hhmmssToMilliseconds('08:30:00');
    let employees = search.create({
        type: 'employee',
        columns: ['custentity_emp_attendance_machine_id'],
    }).run().getRange({ start: 0, end: 999 });


    for (let i = 0; i < employees.length; i++) {
        let empAttRecord = record.create({
            type: 'customrecord_edc_attendance',
        });

        const empMachineID = employees[i].getValue('custentity_emp_attendance_machine_id');
        const empData: {} = attendanceData[empMachineID as string];
        if (empMachineID && empData) {
            let overtime = 0;
            if (empData['workHours']) {
                overtime = Model.hhmmssToMilliseconds(empData['workHours']) - officialWorkingHours;
                if (overtime < 0) {
                    overtime += getDayMissionsDuration(recordDate, employees[i].id);
                    if (overtime < 0) {
                        const remainingPermissionMins = getRemainingPermissionPeriod(recordDate, employees[i].id);
                        if (remainingPermissionMins > 0) {
                            let remainingPermissionMinsAfterDeduction = remainingPermissionMins + (overtime / (60 * 1000));    // (overtime/60,000) to convert from milliseconds to minutes.
                            let reqPermission = 0;
                            if (remainingPermissionMinsAfterDeduction < 0) {
                                reqPermission = remainingPermissionMins;
                                overtime = remainingPermissionMinsAfterDeduction * 60 * 1000;
                            } else {
                                reqPermission = Math.abs(overtime / 60000);
                                overtime = 0;
                            }
                            createPermission(employees[i].id, recordDate, reqPermission, remainingPermissionMins);
                        }
                    }
                }
            }

            empAttRecord.setValue('custrecord_attendance_emp', employees[i].id);
            empAttRecord.setValue('custrecord_attendance_date', recordDate);
            empAttRecord.setValue('custrecord_attendance_check_in', empData['checkIn']);
            empAttRecord.setValue('custrecord_attendance_check_out', empData['checkOut']);
            empAttRecord.setValue('custrecord_attendance_work_hours', empData['workHours']);
            empAttRecord.setValue('custrecord_attendance_overtime', (overtime >= 0) ? Model.millisecondsToHHMMSS(overtime) : "-" + Model.millisecondsToHHMMSS(Math.abs(overtime)));
            empAttRecord.setValue('custrecord_attendance_notes', empData['notes']);
        } else {
            let attendanceNote = "• Absent";
            let businessTripID = checkDayInBusinessTrips(recordDate, employees[i].id);
            if (businessTripID) {
                attendanceNote = "• On a Business Trip ID: " + businessTripID;
            } else {
                let vacationReq = checkDayInVacationRequest(recordDate, employees[i].id);
                if (vacationReq) {
                    if (vacationReq.isFullDay) {
                        attendanceNote = "• On vacation ID: " + vacationReq.id;
                    } else {
                        attendanceNote = `• On a part-day leave ID: ${vacationReq.id} for ${vacationReq.partDay} day.`;
                    }
                }
            }
            empAttRecord.setValue('custrecord_attendance_notes', attendanceNote);
        }
        empAttRecord.save();
    }
}


function checkDayInVacationRequest(attendanceDate, employeeID): { id: string, isFullDay: boolean, partDay?: number } {
    const vacations = search.create({
        type: "customrecord_edc_vac_request",
        filters: [
            search.createFilter({
                name: "custrecord_edc_vac_req_emp_name",
                operator: search.Operator.ANYOF,
                values: employeeID,
            }),
            search.createFilter({
                name: "custrecord_edc_vac_req_status",
                operator: search.Operator.ANYOF,
                values: ApprovalStatus.APPROVED,
            })
        ],
        columns: ["custrecord_edc_vac_req_start", "custrecord_edc_vac_req_end", "custrecord_edc_vac_req_leave_partday"],
    }).run().getRange({ start: 0, end: 999 });

    for (let i = 0; i < vacations.length; i++) {
        const startDate = new Date(vacations[i].getValue("custrecord_edc_vac_req_start").toString());
        const endDate = new Date(vacations[i].getValue("custrecord_edc_vac_req_end").toString());
        const partDay = Number(vacations[i].getText("custrecord_edc_vac_req_leave_partday"));
        if (startDate.getTime() <= attendanceDate.getTime() && attendanceDate.getTime() <= endDate.getTime()) {
            if (partDay == 1 || partDay == 0)
                return { id: vacations[i].id, isFullDay: true };
            else
                return { id: vacations[i].id, isFullDay: false, partDay: partDay }
        }
    }
    return;
}


function checkDayInBusinessTrips(attendanceDate, employeeID): string | boolean {
    const businessTrips = search.create({
        type: "customrecord_edc_business_trip",
        filters: [
            search.createFilter({
                name: "custrecord_edc_btrip_emp",
                operator: search.Operator.ANYOF,
                values: employeeID,
            }),
            search.createFilter({
                name: "custrecord_edc_btrip_status",
                operator: search.Operator.ANYOF,
                values: ApprovalStatus.APPROVED,
            })
        ],
        columns: ["custrecord_edc_btrip_start", "custrecord_edc_btrip_end"],
    }).run().getRange({ start: 0, end: 999 });

    for (let i = 0; i < businessTrips.length; i++) {
        const startDate = new Date(businessTrips[i].getValue("custrecord_edc_btrip_start").toString());
        const endDate = new Date(businessTrips[i].getValue("custrecord_edc_btrip_end").toString());
        if (startDate.getTime() <= attendanceDate.getTime() && attendanceDate.getTime() <= endDate.getTime()) {
            return businessTrips[i].id;
        }
    }
    return false;
}

function getDayMissionsDuration(attendanceDate, employeeID) {
    const missions = search.create({
        type: "customrecord_edc_missions",
        filters: [
            search.createFilter({
                name: "custrecord_edc_mission_date",
                operator: search.Operator.ON,
                values: format.format({ type: format.Type.DATE, value: attendanceDate }),
            }),
            search.createFilter({
                name: "custrecord_edc_mission_emp",
                operator: search.Operator.ANYOF,
                values: employeeID,
            })
        ],
        columns: ["custrecord_edc_mission_date", "custrecord_edc_mission_from", "custrecord_edc_mission_to"],
    }).run().getRange({ start: 0, end: 999 });

    let missionsDuration = 0;
    for (let i = 0; i < missions.length; i++) {
        let duration = new Date(missions[i].getValue("custrecord_edc_mission_from").toString()).getTime() - new Date(missions[i].getValue("custrecord_edc_mission_to").toString()).getTime();
        missionsDuration += duration;
    }
    return missionsDuration;
}

function getRemainingPermissionPeriod(attendanceDate, employeeID) {
    attendanceDate = new Date(attendanceDate);
    // Previous Approved permissions this month.
    let previousPermissions = new Permission()
        .where(PermissionField.EMPLOYEE, '==', employeeID)
        .where(PermissionField.STATUS, '==', ApprovalStatus.APPROVED)
        .where(PermissionField.DATE, 'within', [
            format.format({ type: format.Type.DATE, value: new Date(attendanceDate.setDate(0)) }),
            format.format({ type: format.Type.DATE, value: new Date(attendanceDate.getFullYear(), attendanceDate.getMonth() + 1, 0) })
        ]).find([PermissionField.PERIOD]);

    let takenPeriod = 0;
    if (previousPermissions) {
        for (let i = 0; i < previousPermissions.length; i++)
            takenPeriod += Model.convertPeriodStrToMins(previousPermissions[i][PermissionField.PERIOD]);
    }

    const allowedPermissionHours = 2;
    return (allowedPermissionHours * 60) - takenPeriod;
}

function createPermission(employeeID, date, period, remainingPermissionPeriod) {
    let permissionRecord = record.create({
        type: 'customrecord_edc_permissions',
    });

    permissionRecord.setValue("custrecord_edc_permission_emp", employeeID);
    permissionRecord.setValue("custrecord_edc_permission_date", date);
    permissionRecord.setValue("custrecord_edc_permission_period", Model.convertMinsToText(period));
    permissionRecord.setValue("custrecord_edc_permission_left_period", Model.convertMinsToText(remainingPermissionPeriod - period));
    permissionRecord.setValue("custrecord_edc_permission_memo", "• Created automatically to compensate/reduce the loss in working hours");
    permissionRecord.setValue("custrecord_edc_permission_status", ApprovalStatus.APPROVED);

    permissionRecord.save({ enableSourcing: true, ignoreMandatoryFields: true });
}