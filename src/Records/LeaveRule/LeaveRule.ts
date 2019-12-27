/**
 * @module      LeaveManagement
 * @class       LeaveRule
 * @description `LeaveRule` class extends `BaseModel` class to prepare a Vacation Request and access employee's vacations balance.
 * @author      Mohamed Elshowel
 * @version     1.0.0
 * @repo        https://github.com/MohamedElshowel/NetSuite-Leave-Management
 * @NApiVersion 2.0
 */


import {BaseModel, ColumnType} from '../../Core/Model/BaseModel';

export enum LeaveRuleField {
    SUBSIDIARY = 'subsidiary',
    YEAR = 'year',
    // For Vacation Requests
    DEDUCT_CAUSUAL_FROM_ANNUAL = 'casual_as_annual',
    APPLY_WEEKEND = 'weekend_apply',
    WEEKEND_DAYS = 'weekend_days',
    PERMISSION_HOURS ='permission_hours',
    // For Employees' Balances
    CASUAL = '',
    SICK = '',
    ANNUAL_NORMAL = '',
    ANNUAL_ELDERLY = '',
    ANNUAL_EXPERIENCED = '',
    EXP_BASED_ON_HIREDATE = '',
    ANNUAL_TRASFER = '',
    ELDERLY_AGE = '',
    PROBATION_PERIOD = '',
}


export class LeaveRule extends BaseModel {
    recordType = 'customrecord_edc_vac_rule';
    columnPrefix = 'custrecord_edc_vac_rule_';

    typeMap = {
        'subsidiary': ColumnType.LIST,
        'casual_as_annual': ColumnType.BOOLEAN,
        'weekend_apply': ColumnType.BOOLEAN,
        'weekend_days': ColumnType.MULTI,
        'year': ColumnType.STRING,
        // Map/Reduce Script Fields
    };

    columns = Object.keys(this.typeMap);

    validation = {
        'subsidiary': [],
        'weekend_apply': [],
    }
}