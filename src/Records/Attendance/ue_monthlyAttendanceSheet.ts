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
import * as log from 'N/log';
import * as error from 'N/error'
import { Model } from '../helpers';
import { AttendanceSheet, AttendanceSheetField } from './AttendanceSheet';
import { Holiday, HolidayFields } from '../Holiday/Holiday';
import { LeaveRule, LeaveRuleField } from '../LeaveRule/LeaveRule';
import { Employee, EmployeeField } from '../Employee/Employee';
import { AttendanceField, Attendance } from './Attendance';


export function beforeSubmit(context: EntryPoints.UserEvent.beforeSubmitContext) {
    const attSheetRecord = new AttendanceSheet().createFromRecord(context.newRecord);
    //Prepare working days in the month
    const recordMonth = Number(attSheetRecord.getField(AttendanceSheetField.MONTH).value);
    const recordYear = Number(attSheetRecord.getField(AttendanceSheetField.YEAR).value);
    const workingDays = getWorkingDays(recordMonth, recordYear);
    // Prepare Attendance Sheet Nodes
    const fileId = Number(attSheetRecord.getField(AttendanceSheetField.FILE).value);
    const attendanceFile = file.load({ id: fileId });
    const fileContent = attendanceFile.getContents();    // Getting the inside data
    const empAttendanceStates = getAttendanceStates(fileContent, attSheetRecord);

    saveEmployeesAttendance(empAttendanceStates, workingDays);
}


// ========================== [ Operations Functions ] =========================

function getAttendanceStates(csvFileContent: string, attSheetRecord: AttendanceSheet) {
    /**
     * @example
     *  {
     *      "empFingerprintId": {
     *          name: '',
     *          "date": {
     *              checkIn: "time",
     *              checkOut: "time",
     *              workHours: "number",
     *              notes: "sting",
     *          },  ...
     *      },  ...
     *  }
     */
    const attendanceData: object = {};

    const recordMonth = Number(attSheetRecord.getField(AttendanceSheetField.MONTH).value);
    const recordYear = Number(attSheetRecord.getField(AttendanceSheetField.YEAR).value);
    const fileRows = csvFileContent.split('\r\n');
    // CSV File Columns
    const headers = fileRows[0].split(',').map(text => text.toLowerCase());
    const empNameIndex: number = headers.indexOf(attSheetRecord.empNameHeader.toLowerCase());
    const empMachineIDIndex: number = headers.indexOf(attSheetRecord.machineIDHeader.toLowerCase());
    const timeIndex: number = headers.indexOf(attSheetRecord.timeHeader.toLowerCase());
    const stateIndex: number = headers.indexOf(attSheetRecord.stateHeader.toLowerCase());

    for (let i = 1; i < fileRows.length; i++) {
        const rowData = fileRows[i].split(',');
        const empName: string = rowData[empNameIndex];
        const empFingerprintId = rowData[empMachineIDIndex];

        if (empFingerprintId) {            // Checking this Row has a valid record
            const empAttDate: Date = Model.dateConverter(rowData[timeIndex]);
            const empAttState: string = rowData[stateIndex];
            attendanceData[empFingerprintId] = attendanceData[empFingerprintId] || {};

            if (!attendanceData[empFingerprintId].name)
                attendanceData[empFingerprintId].name = empName;

            if (recordYear == empAttDate.getFullYear() && recordMonth == empAttDate.getMonth() + 1) {
                const attDateString = empAttDate.toLocaleDateString('en-us');

                if (empAttState.toLowerCase() == attSheetRecord.checkInString.toLowerCase()) {  // Check-In
                    attendanceData[empFingerprintId][attDateString] = attendanceData[empFingerprintId][attDateString] || {};

                    // Save only the first CheckIn.
                    if (!attendanceData[empFingerprintId][attDateString].checkIn)
                        attendanceData[empFingerprintId][attDateString].checkIn = empAttDate;

                } else if (empAttState.toLowerCase() == attSheetRecord.checkOutString.toLowerCase()) {  // Check-Out
                    attendanceData[empFingerprintId][attDateString] = attendanceData[empFingerprintId][attDateString] || {};

                    // Save the last CheckOut
                    attendanceData[empFingerprintId][attDateString].checkOut = empAttDate;
                }
            } else {
                log.debug("Invalid Date", empAttDate);
            }
        } else {
            // Add general note for employees who haven't fingerprint machine ID in the CSV sheet.
            attSheetRecord.getField(AttendanceSheetField.NOTES).value +=
                `• "${empName}" has records for attendance in the sheet ,but doesn't have a fingerprint machine ID.\n`;
        }
    }
    return attendanceData;
}

function getWorkingDays(month: number, year: number): Date[] {
    let holidayRecords = new Holiday().find([HolidayFields.DATE]);
    let holidays = holidayRecords.map((holiday: Holiday) => new Date(holiday.getField(HolidayFields.DATE).value.toString()));
    let daysInMonth = getDaysInMonth(month, year);
    let workingDays = daysInMonth.filter(day => holidays.indexOf(day) < 0);
    return workingDays.filter(day => day.getDay() != 5 && day.getDay() != 6);   //Exclude Saturdays & Sundays
}
// let daysNoInMonth = new Date(new Date(new Date().setMonth(month)).setDate(0)).getDate();

function getDaysInMonth(month: number, year: number) {
    let date = new Date(year, month, 1);
    let days: Date[] = [];
    while (date.getMonth() === month) {
        days.push(date);
        date.setDate(date.getDate() + 1);
    }
    return days;
}

function saveEmployeesAttendance(states: object, workingDays: Date[]) {
    let attSheetNotes = "";
    let attendancePrefix = new Attendance().columnPrefix;

    let employees = search.create({
        type: search.Type.EMPLOYEE,
        columns: [EmployeeField.MACHINE_ID],
    }).run().getRange({ start: 0, end: 999 });

    let empMachineIDs = employees.map(emp => Number(emp.getValue(EmployeeField.MACHINE_ID)));

    for (let i = 0; i < empMachineIDs.length; i++) {
        let empMonthAttendance = (empMachineIDs[i]) ? states[empMachineIDs[i]] : null;
        if (empMonthAttendance) {
            for (let j = 0; j < workingDays.length; j++) {
                let empDayAttendance = empMonthAttendance[workingDays[j].toLocaleDateString('en-us')];

                let attendanceRecord = record.create({
                    type: "customrecord_edc_attendance",
                });

                attendanceRecord.setValue(attendancePrefix + AttendanceField.DATE, workingDays[j]);
                attendanceRecord.setValue(attendancePrefix + AttendanceField.EMPLOYEE, employees[i].id);
                attendanceRecord.setValue(attendancePrefix + AttendanceField.MACHINE_ID, empMachineIDs[i]);

                attendanceRecord.setValue(attendancePrefix + AttendanceField.CHECK_IN, empDayAttendance.checkIn || "");
                attendanceRecord.setValue(attendancePrefix + AttendanceField.CHECK_OUT, empDayAttendance.checkOut || "");

                if (empDayAttendance.checkIn && empDayAttendance.checkOut) {
                    let workPeriod = new Date(empDayAttendance.checkOut).getTime() - new Date(empDayAttendance.checkIn).getTime();
                    let workHours = Model.millisecondsToHHMMSS(workPeriod, true);
                    attendanceRecord.setValue(attendancePrefix + AttendanceField.WORK_HOURS, workHours);
                } else if (empDayAttendance.checkIn && !empDayAttendance.checkOut) {
                    attendanceRecord.setValue(attendancePrefix + AttendanceField.NOTES, "• Missing Check Out");
                } else if (!empDayAttendance.checkIn && empDayAttendance.checkOut) {
                    attendanceRecord.setValue(attendancePrefix + AttendanceField.NOTES, "• Missing Check In");
                } else {
                    attendanceRecord.setValue(attendancePrefix + AttendanceField.NOTES, "• Absent");
                }
                attendanceRecord.save();
            }
        } else {
            attSheetNotes = `• "${employees[i].getText('entityid')}" doesn't have ${(empMachineIDs[i]) ? "attendance records" : "a fingerprint machine ID"}.\n`;
        }
    }
}
