import { DOMComponent } from "../dom";
import './index.css';

class ToggleButton extends DOMComponent {
	constructor(domNode: Element) {
		super(domNode);
		domNode.addEventListener("click", () => {
			domNode.classList.toggle("active");
		});
	}
}

for (const button of document.getElementsByClassName( "hint-toggle")) {
	new ToggleButton(button);
}
