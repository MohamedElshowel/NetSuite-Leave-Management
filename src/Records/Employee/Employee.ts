import { LeaveBalance } from '../LeaveBalance/LeaveBalance';
import { BaseModel, ColumnType } from '../../Core/Model/BaseModel';

export enum EmployeeField {
    NAME = 'entityid',
    JOBTITLE = 'title',
    SUBSIDIARY = 'subsidiary',
    SUPERVISOR = 'supervisor',
    DEPARTMENT = 'department',
    HIREDATE = 'hiredate',
    BIRTHDATE = 'birthdate',
    ISINACTIVE = 'isinactive',
    EXPERIENCE_YEARS = 'custentity_edc_emp_exp_years',
    MACHINE_ID = 'custentity_emp_attendance_machine_id'
}

export class Employee extends BaseModel {

    recordType = 'employee';

    typeMap = {
        'title': ColumnType.STRING,
        'subsidiary': ColumnType.LIST,
        'supervisor': ColumnType.LIST,
        'department': ColumnType.LIST,
        'hiredate': ColumnType.DATE,
        'birthdate': ColumnType.DATE,
        'isinactive': ColumnType.BOOLEAN,
        'custentity_edc_emp_exp_years': ColumnType.NUMBER,
        'custentity_emp_attendance_machine_id': ColumnType.NUMBER,
    };

    relations = {
        vacationBalance: (model, year) => {
            let idField = model._record.getValue('id');
            return new LeaveBalance().where('emp_name', '==', idField)
                .where('year', '==', year);
        }
    }

}