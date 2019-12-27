import { LeaveBalance } from '../LeaveBalance/LeaveBalance';
import { BaseModel, ColumnType } from '../../Core/Model/BaseModel';

export enum EmployeeField {
    JOBTITLE = 'title',
    SUBSIDIARY = 'subsidiary',
    SUPERVISOR = 'supervisor',
    DEPARTMENT = 'department',
    HIREDATE = 'hiredate',
    BIRTHDATE = 'birthdate',
    ISINACTIVE = 'isinactive',
    EXPERIENCE_YEARS = 'custentity_edc_emp_exp_years'
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
        'custentity_edc_emp_exp_years': ColumnType.NUMBER
    };

    relations = {
        vacationBalance: (model, year) => {
            let idField = model._record.getValue('id');
            return new LeaveBalance().where('emp_name', '==', idField)
                .where('year', '==', year);
        }
    }

}