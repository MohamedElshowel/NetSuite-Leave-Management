/**
 * @NScriptName ScheduledScript Reset Remaining Transferred Leave Days
 * @description ScheduledScript to be run on a specific day of the year to reset/remove the reamining transferred balance to all employees.
 * @NApiVersion 2.0
 * @NScriptType ScheduledScript
 * @NModuleScope SameAccount
 */

import { EntryPoints } from 'N/types';
import { LeaveBalance, LeaveBalanceField } from "../LeaveBalance/LeaveBalance";
import * as record from 'N/record'
import * as search from 'N/search'

export function execute(context: EntryPoints.Scheduled.executeContext) {
    const leaveBalanceHelper = new LeaveBalance();

    const leaveBalances = search.create({
        type: leaveBalanceHelper.recordType,
        filters: [{
            name: leaveBalanceHelper.columnPrefix + LeaveBalanceField.YEAR,
            operator: search.Operator.IS,
            values: new Date().getFullYear().toString()
        }],
    }).run().getRange({ start: 0, end: 999 });

    for (let i = 0; i < leaveBalances.length; i++) {
        const balanceRecord = record.load({
            type: leaveBalanceHelper.recordType,
            id: leaveBalances[i].id
        });
        balanceRecord.setValue(leaveBalanceHelper.columnPrefix + LeaveBalanceField.TRANSFERRED, 0);
        balanceRecord.save();
    }
}