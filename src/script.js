document.addEventListener("DOMContentLoaded", function () {
    // Получение элементов
    const input = document.getElementById("datepicker-input");
    const calendar = document.getElementById("datepicker-calendar");
    const calendarBody = document.getElementById("calendar-body");
    const calendarTitle = document.getElementById("calendar-title");
    const confirm = document.getElementById("confirm");
    const prevMonthBtn = document.getElementById("prev-month");
    const nextMonthBtn = document.getElementById("next-month");
    const timeSlider = document.getElementById("time-slider");
    const timeTooltip = document.getElementById("time-tooltip");
    const timeInput = document.getElementById("timeInput");
    const timeDisplay = document.getElementById("timeDisplay");
    const currentTimeBtn = document.getElementById("currentTimeBtn");

    let selectedDate = new Date();

    function updateCalendar() {
        calendarBody.innerHTML = "";
        const year = selectedDate.getFullYear();
        const month = selectedDate.getMonth();
        const firstDay = new Date(year, month, 1).getDay();
        const lastDate = new Date(year, month + 1, 0).getDate();

        calendarTitle.textContent = selectedDate.toLocaleString("ru-RU", { month: "long" });

        for (let i = 0; i < firstDay; i++) {
            calendarBody.appendChild(document.createElement("div"));
        }

        for (let day = 1; day <= lastDate; day++) {
            const dayElement = document.createElement("div");
            dayElement.textContent = day;
            dayElement.classList.add("day");
            dayElement.addEventListener("click", function () {
                selectedDate.setDate(day);
                // input.value = `${day}/${month + 1}/${year}`;
                input.value = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                document.querySelectorAll(".day").forEach(d => d.classList.remove("selected"));
                dayElement.classList.add("selected");
            });
            calendarBody.appendChild(dayElement);
        }
    }

    function formatTime(minutes) {
        let hours = Math.floor(minutes / 60);
        let mins = minutes % 60;
        return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
    }

    function updateTooltip() {
        let time = parseInt(timeSlider.value, 10);
        timeTooltip.textContent = formatTime(time);
        let percent = time / 1439;
        let sliderRect = timeSlider.getBoundingClientRect();
        let thumbWidth = 16;
        let newPosition = percent * (sliderRect.width - thumbWidth) + thumbWidth / 2;
        timeTooltip.style.left = `${newPosition}px`;
    }

    function updateTimeDisplay() {
        const now = new Date();
        timeDisplay.textContent = formatTime(now.getHours() * 60 + now.getMinutes());
    }

    function toggleCurrentTimeTracking(enabled) {
        if (enabled) {
            timeSlider.value = new Date().getHours() * 60 + new Date().getMinutes();
            updateTooltip();
            setInterval(updateTimeDisplay, 1000);
        } else {
            timeSlider.value = 720;
            updateTooltip();
            timeDisplay.textContent = "12:00";
        }
    }

    confirm.addEventListener("click", () => calendar.classList.add("hidden"));
    input.addEventListener("focus", () => {
        calendar.classList.remove("hidden");
        updateCalendar();
    });
    document.addEventListener("click", event => {
        if (!input.contains(event.target) && !calendar.contains(event.target)) {
            calendar.classList.add("hidden");
        }
    });
    prevMonthBtn.addEventListener("click", () => { selectedDate.setMonth(selectedDate.getMonth() - 1); updateCalendar(); });
    nextMonthBtn.addEventListener("click", () => { selectedDate.setMonth(selectedDate.getMonth() + 1); updateCalendar(); });

    timeSlider.addEventListener("input", updateTooltip);
    timeInput.addEventListener("input", () => { timeDisplay.textContent = formatTime(timeInput.value); });
    timeDisplay.addEventListener("click", () => timeInput.showPicker());

    currentTimeBtn.addEventListener("change", () => toggleCurrentTimeTracking(currentTimeBtn.checked));
    toggleCurrentTimeTracking(currentTimeBtn.checked);

    updateCalendar();
    updateTooltip();
});
