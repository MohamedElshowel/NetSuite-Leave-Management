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
import * as error from 'N/error'
import { Model } from '../helpers';
import { AttendanceSheet, AttendanceSheetField } from './AttendanceSheet';

export function beforeLoad(context: EntryPoints.UserEvent.beforeLoadContext) {

    // let attendance = new AttendanceSheet().createFromRecord(context.newRecord);
    // let now = new Date();
    // let yesterday = now.setDate(now.getDate() - 1);
    // attendance.getField(AttendanceSheetField.DATE).value = yesterday;
    // // Defaulting File Location
    // attendance.getField(AttendanceField.FILE).value = today + '.csv';
}


export function beforeSubmit(context: EntryPoints.UserEvent.beforeSubmitContext) {

    let attendance = new AttendanceSheet().createFromRecord(context.newRecord);
    // fileName = (fileName.toString().split('.csv').length > 1) ? fileName : fileName + '.csv';
    // attendance.folder + '/' + fileName

    // try {
    let fileID = Number(attendance.getField(AttendanceSheetField.FILE).value);
    let attendanceFile = file.load({ id: fileID });
    let fileContent = attendanceFile.getContents();    // Getting the inside data
    let employeesAttendance = getAttendancePeriod(fileContent, attendance);
    saveEmpAttendance(employeesAttendance, attendance);

    // } catch (err) {
    //     let errorText: string;
    //     if (err.message.indexOf('That record does not exist') !== -1) {
    //         // errorText = `File "${fileName}" does not exist in "${attendance.folder}" folder.`;
    //     } else {
    //         errorText = err.message;
    //     }

    //     let errMsg = '<style>.text {display: none;}' // this will hide the JSON message
    //         + '.bglt td:first-child:not(.textboldnolink):after {'
    //         + 'color:black;font-size:10pt;' // set the desired css for error message
    //         + 'content: url(/images/5square.gif) \''
    //         + '  ' + errorText
    //         + '\'}'
    //         + '</style>';

    //     throw error.create({
    //         name: 'NO_JSON',
    //         message: errMsg,
    //         notifyOff: true
    //     });
    // }
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
            let empAttDate = Model.dateConverter(empData[timeIndex]);
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
    var recordDate = attendanceSheet.getField(AttendanceSheetField.DATE).value;
    let employees = search.create({
        type: 'employee',
        columns: ['custentity_emp_attendance_machine_id'],
    }).run().getRange({ start: 0, end: 999 });


    for (let j = 0; j < employees.length; j++) {

        var isAttended = false;
        let empAttRecord = record.create({
            type: 'customrecord_edc_attendance',
        });
        empAttRecord.setValue('custrecord_attendance_emp', employees[j].id);
        empAttRecord.setValue('custrecord_attendance_date', recordDate);

        for (let i = 0; i < employeesAttendance.length; i++) {
            if (employees[j].getValue('custentity_emp_attendance_machine_id') == employeesAttendance[i]['id']) {

                empAttRecord.setValue('custrecord_attendance_check_in', employeesAttendance[i]['checkIn']);
                empAttRecord.setValue('custrecord_attendance_check_out', employeesAttendance[i]['checkOut']);
                empAttRecord.setValue('custrecord_attendance_work_hours', employeesAttendance[i]['workHours']);
                empAttRecord.setValue('custrecord_attendance_notes', employeesAttendance[i]['notes']);
                isAttended = true;
                break;
            }
        }
        if (!isAttended) {
            empAttRecord.setValue('custrecord_attendance_notes', '• Absent');
        }
        empAttRecord.save();
    }
}

