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
    CASUAL = 'casual_days',
    SICK = 'sick_days',
    ANNUAL_NORMAL = 'regvac_less10y',
    ANNUAL_ELDERLY = 'elderly_emp_vacs',
    ANNUAL_EXPERIENCED = 'regvac_more10y',
    EXP_BASED_ON_HIREDATE = 'exp_hiredate',
    ANNUAL_TRASFER = 'transfer_days',
    ELDERLY_AGE = 'elderly_emp_age',
    PROBATION_PERIOD = 'probation_period',
}


export class LeaveRule extends BaseModel {
    recordType = 'customrecord_edc_vac_rule';
    columnPrefix = 'custrecord_edc_vac_rule_';

    typeMap = {
        'subsidiary': ColumnType.LIST,
        'year': ColumnType.STRING,
        'casual_as_annual': ColumnType.BOOLEAN,
        'weekend_apply': ColumnType.BOOLEAN,
        'weekend_days': ColumnType.MULTI,
        'permission_hours': ColumnType.NUMBER,
        // Balance Fields
        'casual_days': ColumnType.NUMBER,
        'sick_days': ColumnType.NUMBER,
        'regvac_less10y': ColumnType.NUMBER,
        'regvac_more10y': ColumnType.NUMBER,
        'elderly_emp_vacs': ColumnType.NUMBER,
        'exp_hiredate': ColumnType.BOOLEAN,
        'transfer_days': ColumnType.BOOLEAN,
        'elderly_emp_age': ColumnType.NUMBER,
        'probation_period': ColumnType.NUMBER
    };

    columns = Object.keys(this.typeMap);

    validation = {
        'subsidiary': [],
        'weekend_apply': [],
    }
}