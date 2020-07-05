import * as UIMessage from "N/ui/message";
import * as search from "N/search";


export enum ApprovalStatus {
    'PENDING_APPROVAL' = 1,
    'APPROVED' = 2,
    'REJECTED' = 3,
}

export enum PeriodFrequentType {
    Days = 'days',
    Months = 'months',
    Years = 'years',
    Lifetime = 'lifetime',
}

export namespace UI {
    export function showMessage(title, message, duration = 5000, type = UIMessage.Type.WARNING) {
        UIMessage.create({
            title: title,
            message: message,
            type: type
        }).show({ duration: duration });
    }
}

export namespace Model {
    export function resultToObject(result, prefix = ''): object {
        let response = {};

        if (result.columns)
            result.columns.forEach((column) => {
                response[column.name.replace(prefix, '')] = result.getValue(column.name);
            });

        return response;
    }

    export function millisecondsToHuman(number) {
        return {
            'seconds': number / 1000,
            'minutes': number / (1000 * 60),
            'hours': number / (1000 * 60 * 60),
            'days': number / (1000 * 60 * 60 * 24),
            'months': number / (1000 * 60 * 60 * 24 * 30.4375),
            'years': number / (1000 * 60 * 60 * 24 * 365.25)
        }
    }

    export function toNSDateString(date: Date) {
        return (date.getMonth() + 1) + '/' + date.getDate() + '/' + date.getFullYear();
    }

    /**
    * @function convert-NetSuite-Date-to-JavaScript-Date - convert from (DD/MM/YYYY) format at NetSuite to normal date object in JS.
    * @param {string} date - date string or date/time from NetSuite fields
    */
    export function convertNSDateToJSDate(date: string | Date): Date {
        let dateArr = date.toString().split('/');
        return new Date(`${dateArr[1]}/${dateArr[0]}/${dateArr[2]}`);
    }

    /**
     * @param {Date} date - JavaScript Date Object
     * @param {string} timeZone - the time zone that the date will be converted to. i.e, `"Africa/Cairo"` and `"Europe/Zurich"`
     */
    export function convertDateToAnotherTimeZone(date: Date, timeZone: string = 'Africa/Cairo'): Date {
        let dateString = date.toLocaleString('en-US', { timeZone: timeZone }).split(',')[0].split('/');
        return new Date(`${dateString[0]}/${dateString[1]}/${dateString[2]}`);
    }

    export function getWorkingDays(startDate, endDate, weekEnds: any = [5, 6], holidays = []) {
        let result = 0;

        let currentDate = startDate;
        while (currentDate <= endDate) {
            let weekDay = currentDate.getDay();

            if (
                weekEnds.indexOf(weekDay) == -1
                &&
                holidays.filter(holiday => holiday.toDateString() == currentDate.toDateString()).length == 0
            )
                result++;


            currentDate.setDate(currentDate.getDate() + 1);
        }

        return result;
    }


    export function convertPeriodStrToMins(periodString) {
        let actualPeriod = 0;
        let periodStrArray = periodString.split(' ');

        if (periodStrArray[0][1]) {                // Hours don't have [0][1]
            actualPeriod = Number(periodStrArray[0]);

        } else {
            actualPeriod = Number(periodStrArray[0]) * 60;
            if (periodStrArray[3]) {        // Not Just an Hour ,but also have minutes (&)
                actualPeriod += Number(periodStrArray[3]);
            }
        }
        return actualPeriod;
    }


    /** @param period Number of minutes to be converted */
    export function convertMinsToText(period: number) {

        let periodStr: string;
        if (period >= 60) {

            let hours = Math.floor(period / 60);
            let minutes = period - (hours * 60);
            periodStr = hours + ' hour';
            if (hours > 1) periodStr += 's';

            if (minutes) {
                periodStr += ' & ' + minutes + ' minutes';
            }
        } else {
            periodStr = period + ' minutes';
        }

        return periodStr;
    }

    /**
     * @function millisecondsToHHMMSS converts milliseconds to the "HH:MM:SS" format as a string
     * @param milliseconds MilliSeconds to be converts
     * @param getSeconds   Boolean to check if the result should be HH:MM:SS or HH:MM:00 (ignoring seconds)
     * @returns string formated with "HH:MM:SS"
     */
    export function millisecondsToHHMMSS(milliseconds: number, ignoreSeconds: boolean = false): string {
        // Convert to seconds:
        let seconds = milliseconds / 1000;
        // Extract hours:
        let hours = Math.floor(seconds / 3600); // 3,600 seconds in 1 hour
        seconds = seconds % 3600;               // seconds remaining after extracting hours
        // Extract minutes:
        let minutes = Math.floor(seconds / 60); // 60 seconds in 1 minute
        // Keep only seconds not extracted to minutes:
        seconds = seconds % 60;

        let hrs = ("0" + hours).slice(-2);
        let mins = ("0" + minutes).slice(-2);
        let sec = (!ignoreSeconds) ? ("0" + seconds).slice(-2) : "00";

        return hrs + ':' + mins + ':' + sec;
    }


    /**
     * @param hhmmss string format represents time (HH:MM:SS)
     */
    export function hhmmssToMilliseconds(hhmmss: string) {
        let hours = Number(hhmmss.split(':')[0]);
        let minutes = Number(hhmmss.split(':')[1]);
        let seconds = Number(hhmmss.split(':')[2]);

        return (hours * 1000 * 60 * 60) + (minutes * 1000 * 60) + (seconds * 1000);
    }

    export function getTimeFromDateTime(dateTime) {
        let time = dateTime.toString().split(' ');
        return (time[1]) + ((time[2]) ? ' ' + time[2] : '')    // Check for 12HR/24HR system
    }


    /**
     * @param existDate - Day as it exists in NetSuite or any thing else
     * @param sep - Separator between Date - ex: 25`-`Jan`-`2011 or 25`/`01`/`2011
     */
    export function dateConverter(existDate: string, sep: string = '-'): Date {
        // Getting Day and Time Separately
        var prevDate = existDate.split(' ')[0];
        var time = existDate.slice(prevDate.length + 1, existDate.length).split(':');
        var hour = Number((time[1].split(' ')[1]) ? ((time[1].split(' ')[1].toUpperCase() == 'PM') ? Number(time[0]) + 12 : time[0]) : time[0]);
        var minute = Number(time[1].split(' ')[0]);

        // Detect date separator whether it is '-' or '/'
        sep = (prevDate.indexOf('/') !== -1) ? '/' : sep;
        var day = Number(prevDate.split(sep)[0]);
        var year = Number((prevDate.split(sep)[2].length < 4) ? '20' + prevDate.split(sep)[2] : prevDate.split(sep)[2]);
        var monthText = prevDate.split(sep)[1].toLowerCase();
        var months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
        var month = Number(prevDate.split(sep)[1]) ? (Number(prevDate.split(sep)[1]) - 1) : months.indexOf(monthText);
        var newDate = new Date(year, month, day, hour, minute);
        return newDate;
    }
}