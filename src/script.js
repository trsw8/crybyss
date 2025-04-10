document.addEventListener("DOMContentLoaded", function () {
    // date picker
    const input = document.getElementById("datepicker-input");
    const calendar = document.getElementById("datepicker-calendar");
    const calendarBody = document.getElementById("calendar-body");
    const calendarTitle = document.getElementById("calendar-title");
    const confirm = document.getElementById("confirm");

    const prevMonthBtn = document.getElementById("prev-month");
    const nextMonthBtn = document.getElementById("next-month");

    let selectedDate = new Date();
    function updateCalendar() {
        const [ d, m, y ] = input.value.split( '.' ).map( Number );
        if (d && m && y) selectedDate = new Date( y, m - 1, d );
        calendarBody.innerHTML = "";
        const year = selectedDate.getFullYear();
        const month = selectedDate.getMonth();

        const firstDay = new Date(year, month, 1).getDay();
        const lastDate = new Date(year, month + 1, 0).getDate();

        calendarTitle.textContent = `${selectedDate.toLocaleString("ru-RU", { month: "long" })}`;

        for (let i = 0; i < firstDay; i++) {
            const emptyDiv = document.createElement("div");
            calendarBody.appendChild(emptyDiv);
        }

        for (let day = 1; day <= lastDate; day++) {
            const dayElement = document.createElement("div");
            dayElement.textContent = day;
            dayElement.classList.add("day");
            if (day === d) dayElement.classList.add("selected");

            dayElement.addEventListener("click", function () {
                selectedDate.setDate(day);
                // seleced date value
                input.value = `${day}.${String( month + 1 ).padStart( 2, '0' )}.${year}`;
                window.dispatchEvent(new CustomEvent('datepicker-change', {
                    detail: {
                        date: input.value
                    }
                }));
                dayElement.classList.add("selected");

                const days = document.querySelectorAll(".day");
                days.forEach(function (day) {
                    if (day !== dayElement) {
                        day.classList.remove("selected");
                    }
                });
            });

            calendarBody.appendChild(dayElement);
        }
    }

    confirm.addEventListener("click", function () {
        calendar.classList.add("hidden");
    });

    const calendarSvgWrapper = document.querySelector('.calendar-svg-wrapper');
    if (calendarSvgWrapper) {
        calendarSvgWrapper.addEventListener("click", (event) => {
            if (!calendar.classList.contains('hidden-calendar')) {
                calendar.classList.add('hidden-calendar');
            } else {
                calendar.classList.remove('hidden-calendar');
            }
        });
    }

    const datepickerLabel = document.querySelector('.datepicker-label input');
    if (datepickerLabel) {
        datepickerLabel.addEventListener("click", (event) => {
            if (event.target.closest('.calendar-svg-wrapper')) return;
            if (!calendar.classList.contains('hidden-calendar')) {
                calendar.classList.add('hidden-calendar');
            }
        });
    }

    const confirmBtn = document.querySelector('#confirm');
    if (confirmBtn) {
        confirmBtn.addEventListener("click", (event) => {
            if (!calendar.classList.contains('hidden-calendar')) {
                calendar.classList.add('hidden-calendar');
            }
        });
    }

    document.addEventListener("click", (event) => {
        if (!event.target.closest('.datepicker-label')
        && !event.target.closest('#datepicker-calendar')) {
            if (!calendar.classList.contains('hidden-calendar')) {
                calendar.classList.add('hidden-calendar');
            }
        }
    });

    prevMonthBtn.addEventListener("click", function () {
        selectedDate.setMonth(selectedDate.getMonth() - 1);
        updateCalendar();
    });

    nextMonthBtn.addEventListener("click", function () {
        selectedDate.setMonth(selectedDate.getMonth() + 1);
        updateCalendar();
    });

    updateCalendar();

    //time range
    const timeSlider = document.getElementById("time-slider");
    const timeTooltip = document.getElementById("time-tooltip");

    function formatTime(minutes) {
        let hours = Math.floor(minutes / 60);
        let mins = minutes % 60;
        return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
    }

    //hours
    const timeInput = document.getElementById("timeInput");
    const timeDisplay = document.getElementById("timeDisplay");

    function formatTimer(timeStr) {
        return timeStr ? timeStr : "00:00:00";
    }

    timeInput.addEventListener("input", function () {
        timeDisplay.textContent = formatTimer(timeInput.value);
    });

    timeDisplay.addEventListener("click", function () {
        timeInput.showPicker(); //
    });

    //~ window.addEventListener('timeline-change', function (event) {
        //~ const date = event.detail;
        //~ const day = date.getDate();
        //~ const month = date.getMonth() + 1;
        //~ const year = date.getFullYear();
        //~ const formattedDate = `${day}/${month}/${year}`;
        //~ input.value = formattedDate;
    //~ });
});
