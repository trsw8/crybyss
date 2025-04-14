import { DOMComponent } from "../dom";
import './index.css';

class ToggleButton extends DOMComponent {
	constructor(domNode: Element) {
		super(domNode);
		domNode.addEventListener("click", event => {
			if (!domNode.classList.contains('active')) {
				setTimeout( () => domNode.classList.add("active"), 0 );
			}
		});
		document.addEventListener("click", event => {
			if (domNode.classList.contains('active') && !( event.target as HTMLElement ).closest('.hint-box')) {
				domNode.classList.remove("active");
			}
		});
	}
}

for (const button of document.getElementsByClassName( "hint-toggle")) {
	new ToggleButton(button);
}
