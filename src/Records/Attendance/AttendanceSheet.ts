/**
 * @module      LeaveManagement
 * @class       Attendance Sheet
 * @description AttendanceSheet class extends `BaseModel` class
 * @author      Mohamed Elshowel
 * @version     1.0.0
 * @repo        https://github.com/MohamedElshowel
 * @NApiVersion 2.0
 */

import { BaseModel, ColumnType } from '../../Core/Model/BaseModel';

interface AttendanceSheetInterface {
}

export enum AttendanceSheetField {
    DATE = 'date',
    FILE = 'file',
    // Monthly AttendanceSheet fields
    MONTH = 'month',
    YEAR = 'year',
    NOTES = 'notes',
}

export class AttendanceSheet extends BaseModel implements AttendanceSheetInterface {

    recordType: string = 'customrecord_edc_attendance_sheet';
    columnPrefix: string = 'custrecord_attendance_sheet_';
    folder: string = 'AHK Employees Attendance';
    
    // CSV File Strings
    checkInString: string = 'C/In';
    checkOutString: string = 'C/Out';
    stateHeader: string = 'State';
    empNameHeader: string = 'Name';
    machineIDHeader: string = 'AC-No.';
    timeHeader: string = 'Time';

    // Mapping
    typeMap: object = {
        'date': ColumnType.DATE,
        'file': ColumnType.LIST,
        // Monthly AttendanceSheet fields
        'month': ColumnType.LIST,
        'year': ColumnType.STRING,
        'notes': ColumnType.STRING,
    }

    columns = Object.keys(this.typeMap);
}