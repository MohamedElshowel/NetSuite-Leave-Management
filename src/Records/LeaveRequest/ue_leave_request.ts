/**
 * @NScriptName UserEvent - Vacation Request
 * @NApiVersion 2.0
 * @NScriptType UserEventScript
 * @NModuleScope SameAccount
 */

import { EntryPoints } from 'N/types';
import { LeaveRequest, RequestField, RelationField, BalanceField, EmployeeField, StandardLeaveType } from "./LeaveRequest";
import { ApprovalStatus } from '../helpers';
import { LeaveBalance, LeaveBalanceField } from '../LeaveBalance/LeaveBalance';
import * as search from "N/search";
import * as record from "N/record";
import { log, runtime } from "N";
import { LeaveType } from '../LeaveType/LeaveType';
import { debug } from '@hitc/netsuite-types/N/log';

const resetTransferredDate = {
    day: 1,
    month: 7
}

export function beforeLoad(context: EntryPoints.UserEvent.beforeLoadContext) {
    if (context.type !== context.UserEventType.CREATE)
        return;

    let leaveRequest = new LeaveRequest()
        .createFromRecord(context.newRecord);

    let employeeId = leaveRequest.getField(EmployeeField.EMPLOYEE).value;

    let vacationBalance = new LeaveBalance()
        .where(LeaveBalanceField.EMPLOYEE, '==', employeeId)
        .where(LeaveBalanceField.YEAR, '==', new Date().getFullYear())
        .first(['internalid']);

    if (vacationBalance) {
        leaveRequest.getField(RelationField.BALANCE).value = vacationBalance.getField('internalid').value;
    }

    let leaveRule = leaveRequest.relations
        .leaveRule(Number(leaveRequest.getField(EmployeeField.SUBSIDIARY).value))
        .first(['internalid']);

    if (leaveRule)
        leaveRequest.getField('rule_link').value = leaveRule.getField('internalid').value;

}


export function beforeSubmit(context: EntryPoints.UserEvent.beforeSubmitContext) {
    log.debug("context type", context.type);
    let leaveRequest = new LeaveRequest().createFromRecord(context.newRecord);

    let balanceRecordId = Number(leaveRequest.getField(RelationField.BALANCE).value);
    let leaveBalance = new LeaveBalance().setRecord(balanceRecordId);

    let requestStatus = leaveRequest.getField(RequestField.STATUS).value;
    let leaveTypeID = Number(leaveRequest.getField(RelationField.TYPE_MAPPING).value);

    log.debug("Request Status", requestStatus);

    // Load Leave Type Custom List from NetSuite.
    let leaveType = record.load({
        type: "customlist_edc_vac_types_standard",
        id: leaveTypeID,
    }).getText("name").toString().toLowerCase();

    // Re-Add the balance in case of rejecting a request or deleting un-rejected request.
    if (requestStatus == ApprovalStatus.REJECTED || (context.type === context.UserEventType.DELETE && requestStatus != ApprovalStatus.REJECTED)) {
        console.log("Details", "Will re-add the previous deducted balance");
        switch (leaveType) {
            case StandardLeaveType.ANNUAL:
                addDeductedRegularBalance(leaveRequest, leaveBalance);
                break;
            case StandardLeaveType.CASUAL:
                leaveBalance.getField(LeaveBalanceField.CASUAL).value += Number(leaveRequest.getField(RequestField.LEAVE_DAYS).value);
                if (Boolean(leaveRequest.getField(RelationField.RULE_CASUAL_FROM_ANNUAL).value))
                    addDeductedRegularBalance(leaveRequest, leaveBalance);
                break;
            case StandardLeaveType.TRANSFERRED:
                leaveBalance.getField(LeaveBalanceField.TRANSFERRED).value += Number(leaveRequest.getField(RequestField.LEAVE_DAYS).value);
                break;
            case StandardLeaveType.REPLACEMENT:
                leaveBalance.getField(LeaveBalanceField.REPLACEMENT).value += Number(leaveRequest.getField(RequestField.LEAVE_DAYS).value);
                break;
            case StandardLeaveType.SICK:
                leaveBalance.getField(LeaveBalanceField.SICK).value += Number(leaveRequest.getField(RequestField.LEAVE_DAYS).value);
                break;
            case StandardLeaveType.UNPAID:
                leaveBalance.getField(LeaveBalanceField.UNPAID).value -= Number(leaveRequest.getField(RequestField.LEAVE_DAYS).value);
                break;
        }
        leaveBalance.save();
    } else if (requestStatus == ApprovalStatus.PENDING_DEDUCT_BALANCE) {
        log.debug("Details", "Will deduct the balance");
        // Save the current balances without approving.
        leaveBalance.getField(LeaveBalanceField.ANNUAL).value = Number(leaveRequest.getField(BalanceField.ANNUAL).value);
        leaveBalance.getField(LeaveBalanceField.TRANSFERRED).value = Number(leaveRequest.getField(BalanceField.TRANSFERRED).value);
        leaveBalance.getField(LeaveBalanceField.REPLACEMENT).value = Number(leaveRequest.getField(BalanceField.REPLACEMENT).value);
        leaveBalance.getField(LeaveBalanceField.CASUAL).value = Number(leaveRequest.getField(BalanceField.CASUAL).value);
        leaveBalance.getField(LeaveBalanceField.SICK).value = Number(leaveRequest.getField(BalanceField.SICK).value);
        leaveBalance.getField(LeaveBalanceField.UNPAID).value = Number(leaveRequest.getField(BalanceField.UNPAID).value);
        leaveBalance.save();
    }
}

function addDeductedRegularBalance(leaveRequest: LeaveRequest, leaveBalance: LeaveBalance) {
    const resetTransferredDateObj = new Date(new Date().getFullYear(), resetTransferredDate.month - 1, resetTransferredDate.day);
    const vacEndDate = new Date(leaveRequest.getField(RequestField.END).value.toString());
    const isTransferBalanceApplied = Boolean(leaveRequest.getField(RelationField.RULE_TRANSFER_UNUSED_BALANCE).value);
    let requestedDays = Number(leaveRequest.getField(RequestField.LEAVE_DAYS).value);
    const maxAnnualAllowed = Number(leaveBalance.getField(LeaveBalanceField.STANDARD_ANNUAL).value);
    const currentAnnualBalance = Number(leaveBalance.getField(LeaveBalanceField.ANNUAL).value);
    const currentTransferredBalance = Number(leaveBalance.getField(LeaveBalanceField.TRANSFERRED).value);

    const initialBalanceObj = JSON.parse(leaveRequest.getField(BalanceField.INITIAL_BALANCE_OBJ).value.toString());
    const initialTransferredDays = Number(initialBalanceObj.transferred);

    // In case the transfer vacation rule is not applied.
    if (!isTransferBalanceApplied) {
        leaveBalance.getField(LeaveBalanceField.ANNUAL).value = currentAnnualBalance + requestedDays;
        return;
    }

    // In case the transferred balance applied and leave end date not after resetting transferred days.
    if (vacEndDate < resetTransferredDateObj) {
        if ((currentAnnualBalance + requestedDays) < maxAnnualAllowed) {
            leaveBalance.getField(LeaveBalanceField.ANNUAL).value = currentAnnualBalance + requestedDays;
        } else {
            leaveBalance.getField(LeaveBalanceField.ANNUAL).value = maxAnnualAllowed;
            let remainingUnAssignedDays = requestedDays - (maxAnnualAllowed - currentAnnualBalance);
            leaveBalance.getField(LeaveBalanceField.TRANSFERRED).value = currentTransferredBalance + remainingUnAssignedDays;
        }
    } else {
        let ignoredDays = initialTransferredDays - Number(leaveRequest.getField(BalanceField.TRANSFERRED).value);
        requestedDays -= ignoredDays;

        leaveBalance.getField(LeaveBalanceField.ANNUAL).value =
            ((currentAnnualBalance + requestedDays) < maxAnnualAllowed) ? currentAnnualBalance + requestedDays : maxAnnualAllowed;
    }
}