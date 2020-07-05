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
    let employeesAttendance = getAttendancePeriod(fileContent, attendance);
    saveEmpAttendance(employeesAttendance, attendance);
}


// ========================== [ Operations Functions ] =========================

function getAttendancePeriod(csvFileContent, attendanceSheet: AttendanceSheet) {
    let recordDate = new Date(attendanceSheet.getField(AttendanceSheetField.DATE).value.toString());
    let checkInList = [];
    let fileRows = csvFileContent.split('\r\n');
    // CSV File Columns
    let headers = fileRows[0].split(',');
    let empNameIndex: number = headers.indexOf(attendanceSheet.empNameHeader);
    let empMachineIDIndex: number = headers.indexOf(attendanceSheet.machineIDHeader);
    let timeIndex: number = headers.indexOf(attendanceSheet.timeHeader);
    let stateIndex: number = headers.indexOf(attendanceSheet.stateHeader);
    let employeesAttendance = [];

    for (let i = 1; i < fileRows.length; i++) {
        let empData = fileRows[i].split(',');
        let empMachineID = empData[empMachineIDIndex];

        if (empMachineID) {            // Checking this Row has a record
            let empName: string = empData[empNameIndex];
            let empAttState: string = empData[stateIndex];
            let empAttDate = new Date(empData[timeIndex]);
            let empAttDetails = {};
            let checkInAndOut = false;

            if (empAttState == attendanceSheet.checkInString) {  // Check-In

                if (recordDate.getDate() == empAttDate.getDate() && recordDate.getMonth() == empAttDate.getMonth()
                    && recordDate.getFullYear() == empAttDate.getFullYear()) {

                    checkInList.push({
                        name: empName,
                        id: empMachineID,
                        date: empAttDate,
                        time: (empAttDate)
                    });
                }
            } else if (empAttState == attendanceSheet.checkOutString) {  // Check-Out
                let empCheckOutDate = empAttDate;
                for (let j = 0; j < checkInList.length; j++) {
                    if (empMachineID == checkInList[j].id) {
                        //Calculating Working Hours
                        let workPeriodInMS = empCheckOutDate.getTime() - checkInList[j].date.getTime();

                        if (Model.millisecondsToHuman(workPeriodInMS).days >= 1) {
                            // Missing Check-Out
                            empAttDetails['notes'] = "• Missing Check-Out";
                        } else {
                            let workPeriod = Model.millisecondsToHHMMSS(workPeriodInMS, true);
                            empAttDetails['workHours'] = workPeriod;
                        }

                        empAttDetails['id'] = empMachineID;
                        empAttDetails['name'] = empName;
                        empAttDetails['checkIn'] = checkInList[j].date;
                        empAttDetails['checkOut'] = (empCheckOutDate);
                        employeesAttendance.push(empAttDetails);

                        // Removing Employee's Checked-In Record from the list (Performance Wise)
                        checkInList.splice(j, 1);

                        checkInAndOut = true;
                        break;
                    }
                    if (!checkInAndOut) {
                        employeesAttendance.push({
                            name: empName,
                            id: empMachineID,
                            checkOut: (empCheckOutDate),
                            notes: "• Missing Check-In"
                        });
                    }
                }

            }
        }
    }

    // Checking if an employee has a missing check-out
    for (let i = 0; i < checkInList.length; i++) {
        for (let j = 0; j < employeesAttendance.length; j++) {
            if (checkInList[i].id == employeesAttendance[j].id) {
                checkInList.splice(i, 1);
                break;
            }
        }
        employeesAttendance.push({
            name: checkInList[i].name,
            id: checkInList[i].id,
            checkIn: checkInList[i].checkIn,
            notes: "• Missing Check-Out"
        });
    }

    return employeesAttendance;
}

function saveEmpAttendance(employeesAttendance: {}[], attendanceSheet: AttendanceSheet) {
    // let employees = new Employee().find(['custentity_emp_attendance_machine_id']);
    const recordDate = attendanceSheet.getField(AttendanceSheetField.DATE).value;
    const officialWorkingHours = Model.hhmmssToMilliseconds('08:30:00');
    let employees = search.create({
        type: 'employee',
        columns: ['custentity_emp_attendance_machine_id'],
    }).run().getRange({ start: 0, end: 999 });


    for (let j = 0; j < employees.length; j++) {
        let isAttended = false;
        let empAttRecord = record.create({
            type: 'customrecord_edc_attendance',
        });

        for (let i = 0; i < employeesAttendance.length; i++) {
            if (employees[j].getValue('custentity_emp_attendance_machine_id') == employeesAttendance[i]['id']) {
                let overtime = 0;
                if (employeesAttendance[i]['workHours']) {
                    overtime = Model.hhmmssToMilliseconds(employeesAttendance[i]['workHours']) - officialWorkingHours;
                    if (overtime < 0) {
                        overtime += getDayMissionsDuration(recordDate, employees[j].id);
                        if (overtime < 0) {
                            const remainingPermissionMins = getRemainingPermissionPeriod(recordDate, employees[j].id);
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
                                createPermission(employees[j].id, recordDate, reqPermission, remainingPermissionMins);
                            }
                        }
                    }
                }

                empAttRecord.setValue('custrecord_attendance_emp', employees[j].id);
                empAttRecord.setValue('custrecord_attendance_date', recordDate);
                empAttRecord.setValue('custrecord_attendance_check_in', employeesAttendance[i]['checkIn']);
                empAttRecord.setValue('custrecord_attendance_check_out', employeesAttendance[i]['checkOut']);
                empAttRecord.setValue('custrecord_attendance_work_hours', employeesAttendance[i]['workHours']);
                empAttRecord.setValue('custrecord_attendance_overtime', (overtime >= 0) ? Model.millisecondsToHHMMSS(overtime) : "-" + Model.millisecondsToHHMMSS(Math.abs(overtime)));
                empAttRecord.setValue('custrecord_attendance_notes', employeesAttendance[i]['notes']);
                isAttended = true;
                break;
            }
        }
        if (!isAttended) {
            let businessTripID = checkDayInBusinessTrips(recordDate, employees[j].id);
            let attendanceNote = (businessTripID) ? '• In Business Trip ID: ' + businessTripID : '• Absent';
            empAttRecord.setValue('custrecord_attendance_notes', attendanceNote);
        }
        empAttRecord.save();
    }
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