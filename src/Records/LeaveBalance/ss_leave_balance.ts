/**
 * @NScriptName ScheduledScript Leave Balance
 * @description ScheduledScript to be run on the first day of the year to add vacations balance to all the employees.
 * @NApiVersion 2.0
 * @NScriptType ScheduledScript
 * @NModuleScope SameAccount
 */

import { EntryPoints } from 'N/types';
import * as record from 'N/record';
import * as search from 'N/search';
import * as file from 'N/file';
import * as log from 'N/log';
import * as runtime from 'N/runtime';
import { Model } from '../helpers';
import { LeaveBalance, LeaveBalanceField } from "../LeaveBalance/LeaveBalance";
import { Employee, EmployeeField } from '../Employee/Employee';
import { LeaveRule, LeaveRuleField } from '../LeaveRule/LeaveRule';


export function execute(context: EntryPoints.Scheduled.executeContext) {
    // list all loaded subsidiaries
    let subsidiariesIDs = [];
    let leaveRuleRecords = [];

    const today = new Date();
    const thisYear = today.getFullYear();

    // Get all the emoloyees recorded (Max. allowed = 1000 employees)
    const employees = search.create({
        type: search.Type.EMPLOYEE,
        columns: [
            EmployeeField.ISINACTIVE, EmployeeField.SUBSIDIARY, EmployeeField.BIRTHDATE, EmployeeField.HIREDATE, EmployeeField.EXPERIENCE_YEARS,
            EmployeeField.DEPARTMENT, EmployeeField.SUPERVISOR, EmployeeField.JOBTITLE, EmployeeField.NAME
        ],
    }).run().getRange({ start: 0, end: 999 });

    // const employees = new Employee().find([
    //     EmployeeField.ISINACTIVE, EmployeeField.SUBSIDIARY, EmployeeField.BIRTHDATE, EmployeeField.HIREDATE, EmployeeField.EXPERIENCE_YEARS,
    //     EmployeeField.DEPARTMENT, EmployeeField.SUPERVISOR, EmployeeField.JOBTITLE
    // ]);

    for (let i = 0; i < employees.length; i++) {
        const isInactive = employees[i].getValue(EmployeeField.ISINACTIVE);
        if (!isInactive) {

            const empName = employees[i].getValue(EmployeeField.NAME);
            // Skip employees who have not birth date or hire date
            if (!employees[i].getValue(EmployeeField.BIRTHDATE) || !employees[i].getValue(EmployeeField.HIREDATE)) {
                log.audit(`${empName} won't have a leave balance in ${thisYear}!`, `${empName} does not have a birthdate or a hiredate`);
                continue;
            }

            let leaveRule: LeaveRule;
            // Load Subsidiary's leave rule
            const subsidiaryID = employees[i].getValue(EmployeeField.SUBSIDIARY);

            // Check if it is the Subsidiary's Rule Record is not loaded before.
            if (subsidiariesIDs.indexOf(subsidiaryID) === -1) {
                leaveRule = new LeaveRule()
                    .where(LeaveRuleField.SUBSIDIARY, '==', subsidiaryID)
                    .where(LeaveRuleField.YEAR, '==', thisYear.toString())
                    .first([LeaveRuleField.CASUAL, LeaveRuleField.SICK, LeaveRuleField.ANNUAL_NORMAL,
                    LeaveRuleField.ANNUAL_ELDERLY, LeaveRuleField.ANNUAL_EXPERIENCED,
                    LeaveRuleField.ANNUAL_TRASFER, LeaveRuleField.EXP_BASED_ON_HIREDATE,
                    LeaveRuleField.ELDERLY_AGE, LeaveRuleField.PROBATION_PERIOD]);

                if (leaveRule) {
                    // Push the leave rule result to the array
                    leaveRuleRecords.push(leaveRule);
                    subsidiariesIDs.push(subsidiaryID);
                } else {
                    log.audit(`${empName} won't have a leave balance in ${thisYear}!`,
                        `Can't find a Leave Rule for ${empName}'s Subsidiary (${employees[i].getText(EmployeeField.SUBSIDIARY)}) in ${thisYear}`);
                    continue;   //Skip this employee
                }
            } else {
                leaveRule = leaveRuleRecords[subsidiariesIDs.indexOf(subsidiaryID)];
            }

            const hireDate = Model.convertNSDateToJSDate(employees[i].getValue(EmployeeField.HIREDATE).toString());
            const birthdate = Model.convertNSDateToJSDate(employees[i].getValue(EmployeeField.BIRTHDATE).toString());
            const empExpYears = Number(employees[i].getValue(EmployeeField.EXPERIENCE_YEARS));
            const currentAge = Math.floor(Model.millisecondsToHuman(today.getTime() - birthdate.getTime()).years);
            const workingPeriod = Math.floor(Model.millisecondsToHuman(today.getTime() - hireDate.getTime()).months);

            let annualBalance = 0;
            let transferredBalance = 0;
            const casualBalance = leaveRule.getField(LeaveRuleField.CASUAL).value;
            const sickBalance = leaveRule.getField(LeaveRuleField.SICK).value;
            const probationPeriod = leaveRule.getField(LeaveRuleField.PROBATION_PERIOD).value;
            const elderlyAge = leaveRule.getField(LeaveRuleField.ELDERLY_AGE).value;
            const isExpBasedOnHireDate = leaveRule.getField(LeaveRuleField.EXP_BASED_ON_HIREDATE).value;
            const isTransferredBalance = leaveRule.getField(LeaveRuleField.ANNUAL_TRASFER).value;

            if (workingPeriod >= probationPeriod) {
                if ((isExpBasedOnHireDate && (workingPeriod / 12 >= 10)) || !isExpBasedOnHireDate && empExpYears >= 10) {
                    annualBalance = Number(leaveRule.getField(LeaveRuleField.ANNUAL_EXPERIENCED).value);
                } else {
                    annualBalance = Number(leaveRule.getField(LeaveRuleField.ANNUAL_NORMAL).value);
                }
            }

            // If the employee is elderly override the balance with the elderly balance
            if (currentAge >= elderlyAge) {
                annualBalance = Number(leaveRule.getField(LeaveRuleField.ANNUAL_ELDERLY).value);
            }

            // Add the remaining annual balance to the new year's transferred balance
            if (isTransferredBalance) {
                const prevLeaveBalance = new LeaveBalance()
                    .where(LeaveBalanceField.EMPLOYEE, '==', employees[i].id)
                    .where(LeaveBalanceField.YEAR, '==', thisYear - 1)
                    .first([LeaveBalanceField.ANNUAL]);

                if (prevLeaveBalance) {
                    transferredBalance = Number(prevLeaveBalance.getField(LeaveBalanceField.ANNUAL).value);
                }
            }

            // Saving the new balance to a new LeaveBalance record
            let leaveBalance = new LeaveBalance()
                .createFromRecord(record.create({
                    type: new LeaveBalance().recordType,
                    isDynamic: true
                }));

            // Initial Data
            leaveBalance.getField(LeaveBalanceField.EMPLOYEE).value = employees[i].id;
            leaveBalance.getField(LeaveBalanceField.YEAR).value = thisYear.toString().split('.')[0];
            leaveBalance.getField(LeaveBalanceField.SUBSIDIARY).value = subsidiaryID;
            leaveBalance.getField(LeaveBalanceField.DEPARTMENT).value = employees[i].getValue(EmployeeField.DEPARTMENT);
            leaveBalance.getField(LeaveBalanceField.SUPERVISOR).value = employees[i].getValue(EmployeeField.SUPERVISOR);
            leaveBalance.getField(LeaveBalanceField.JOBTITLE).value = employees[i].getValue(EmployeeField.JOBTITLE);

            // Balances
            leaveBalance.getField(LeaveBalanceField.ANNUAL).value = annualBalance;
            leaveBalance.getField(LeaveBalanceField.CASUAL).value = casualBalance;
            leaveBalance.getField(LeaveBalanceField.SICK).value = sickBalance;
            leaveBalance.getField(LeaveBalanceField.TRANSFERRED).value = transferredBalance;
            leaveBalance.getField(LeaveBalanceField.REPLACEMENT).value = 0;
            leaveBalance.getField(LeaveBalanceField.UNPAID).value = 0;

            leaveBalance.save();

            // Increment the years of experience by 1 if it is enabled in script parameters
            if (runtime.getCurrentScript().getParameter({ name: 'custscript_ss_increment_exp_years' })) {
                var employeeRecord = record.load({
                    type: record.Type.EMPLOYEE,
                    id: employees[i].id,
                });
                employeeRecord.setValue(EmployeeField.EXPERIENCE_YEARS, (empExpYears + 1));
                employeeRecord.save();
            }
        }
    }
}