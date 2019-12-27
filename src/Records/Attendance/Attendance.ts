/**
 * @module      LeaveManagement
 * @class       Attendance
 * @description Attendance class extends `BaseModel` class
 * @author      Mohamed Elshowel
 * @version     1.0.0
 * @repo        https://github.com/MohamedElshowel/NetSuite-Leave-Management
 * @NApiVersion 2.0
 */

import { BaseModel, ColumnType } from '../../Core/Model/BaseModel';

interface AttendanceInterface {
}

export enum AttendanceField {
    EMPLOYEE = 'emp',
    DATE = 'date',
    CHECK_IN = 'check_in',
    CHECK_OUT = 'check_out',
    WORK_HOURS = 'work_hours',
    MACHINE_ID = 'machine_id',
    NOTES = 'notes'
}

export class Attendance extends BaseModel implements AttendanceInterface {

    recordType: string = 'customrecord_edc_attendance';
    columnPrefix: string = 'custrecord_attendance_';

    // Mapping
    typeMap: object = {
        'emp': ColumnType.LIST,
        'date': ColumnType.DATE,
        'check_in': ColumnType.NUMBER,
        'check_out': ColumnType.NUMBER,
        'work_hours': ColumnType.STRING,
        'machine_id': ColumnType.NUMBER,
        'notes': ColumnType.STRING,
    }

    columns = Object.keys(this.typeMap);
}