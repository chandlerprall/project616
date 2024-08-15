var g = document.getElementById.bind(document)
var ce = document.createElement.bind(document)
var k = Object.keys.bind(Object)
var v = Object.values.bind(Object)

var b = document.body

var $available_tasks = g('available_ai_tasks')
$available_tasks.onclick = ({target}) => {
	tasks[assigning_task_to].slot.innerHTML = ''
	if (target.innerHTML === '❌') {

	} else {
		tasks[assigning_task_to].slot.append(target.childNodes[0].cloneNode(true))
	}
	$available_tasks.togglePopover()
}

var assigning_task_to
var tasks = (() => {
	var $aitasks = g('ai-tasks')
	var update = () => {
		$aitasks.innerHTML = ''
		$aitasks.append(...tasks.map((x, idx) => {
			var element = ce('button')
			element.onclick = () => assigning_task_to = idx
			element.classList.add('ai-task')
			element.setAttribute('popovertarget', 'available_ai_tasks')
			element.append(x.slot)
			return element
		}))
	}
	var tasks = new Proxy([], {
		get(target, prop) {
			if (prop === 'push' || prop === 'unshift' || prop === 'pop' || prop === 'shift') {
				return (...args) => {
					Reflect.apply(target[prop], target, args)
					update()
				}
			}
			return Reflect.get(target, prop)
		},
		set(target, prop, value) {
			Reflect.set(target, prop, value)
			if (prop === 'length') update()
			return true
		},
	})
	return tasks
})()

tasks.push({slot: ce('div')})
tasks.push({slot: ce('div')})

var screens = {
	main: g('main'),
	game: g('game'),
}

var buttons = {
	start: g('start'),
}

buttons.start.onclick = () => {
	v(screens).forEach(x => x.removeAttribute('data-active'))
	screens.game.setAttribute('data-active', true)
}
buttons.start.click()

var lastTime = Date.now()
setInterval(() => {
	var now = Date.now()

	b.style.setProperty('--timeoffset', now % 1000000)

	lastTime = Date.now()
}, 1000 / 60)