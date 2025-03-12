const currentTimeBtn = document.getElementById("currentTimeBtn")


const input = document.getElementById("datepicker-input");
const calendar = document.getElementById("datepicker-calendar");
const dataToolTip = document.getElementsByClassName("datepicker-label")[0]
const calendarBody = document.getElementById("calendar-body");
const calendarTitle = document.getElementById("calendar-title");
const confirm = document.getElementById("confirm");
const prevMonthBtn = document.getElementById("prev-month");
const nextMonthBtn = document.getElementById("next-month");

const timeSlider = document.getElementById("time-slider");
const timeTooltip = document.getElementById("time-tooltip");


const timeInput = document.getElementById("timeInput");
const timeDisplay = document.getElementById("timeDisplay");

if(currentTimeBtn){
    currentTimeBtn.checked = true
}

let currentTime 
let currentRage
 function DOMContentLoaded (){
        

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
                input.value = `${year} ${month + 1} ${day}`;
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
    
    input.value = `${new Date().getFullYear()} ${new Date().getMonth()+1} ${new Date().getDate()}`
    updateCalendar();
    
    //time range


        if(currentTimeBtn.checked){

    const filteringTime = ()=>{


    let CurrentTimeRange = new Date().getHours() * 60 + new Date().getMinutes()
    timeSlider.value =CurrentTimeRange;    

    function formatTime(minutes) {
        let hours = Math.floor(minutes / 60);
        let mins = minutes % 60;
        return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
    }

    function updateTooltip() {
        
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
    if (CurrentTimeRange == timeSlider.value) {
    currentRage = setInterval(()=>{
            filteringTime()
        },20000)
    }
}
filteringTime()

    //hours

    const filteringHourses = () => {
      
        function formatTimer(timeStr) {
          return timeStr ? timeStr : "00:00:00";
        }
        const updateTimeDisplay = () => {
          const now = new Date();
          const hours = now.getHours().toString().padStart(2, '0');
          const minutes = now.getMinutes().toString().padStart(2, '0');
          
          timeDisplay.textContent = `${hours}:${minutes}`;
        };        
        currentTime =  setInterval(updateTimeDisplay, 1000);

        timeInput.addEventListener("input", function () {
          timeDisplay.textContent = formatTimer(timeInput.value);
        });

        timeDisplay.addEventListener("click", function () {
          timeInput.showPicker();
        });
      };
      
      filteringHourses();
     }else{    
     clearInterval(currentTime)
     clearInterval(currentRage)
        const filteringTime = ()=>{

            timeSlider.value =720;    
        
            function formatTime(minutes) {
                let hours = Math.floor(minutes / 60);
                let mins = minutes % 60;
                return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
            }
        
            function updateTooltip() {
                
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
        }
        filteringTime()
        const filteringHourses = () => {
            function formatTimer(timeStr) {
                return timeStr ? timeStr : "00:00:00";
            }
            timeInput.addEventListener("input", function () {
                timeDisplay.textContent = formatTimer(timeInput.value);
            });   
        } 
          filteringHourses();     
    }
};

document.addEventListener("DOMContentLoaded",DOMContentLoaded())


currentTimeBtn.addEventListener('change' , ()=>{
    DOMContentLoaded()
})