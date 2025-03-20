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

            dayElement.addEventListener("click", function () {
                selectedDate.setDate(day);
                // seleced date value
                input.value = `${day}/${month + 1}/${year}`;
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

    input.addEventListener("focus", function () {
        calendar.classList.remove("hidden");
        updateCalendar();
    });

    document.addEventListener("click", function (event) {
        if (!input.contains(event.target) && !calendar.contains(event.target)) {
            calendar.classList.add("hidden");
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

    function updateTooltip() {
        // time value
        let time = parseInt(timeSlider.value, 10);
        timeTooltip.textContent = formatTime(time);

        let sliderRect = timeSlider.getBoundingClientRect();
        let thumbWidth = 16; 
        let percent = (time / 1439); 

        let newPosition = percent * (sliderRect.width - thumbWidth) + thumbWidth / 2;
        timeTooltip.style.left = `${newPosition}px`;
    }

    timeSlider.addEventListener("input", updateTooltip);
    updateTooltip();

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

    window.addEventListener('timeline-change', function (event) {
        const date = event.detail.date;
        const day = date.getDate();
        const month = date.getMonth() + 1;
        const year = date.getFullYear();
        const formattedDate = `${day}/${month}/${year}`;
        input.value = formattedDate;
    });
});

