import {execute, variables, industries, commodities} from './economy.js'
import {optimize, Execution} from './imho.js'

const g = document.getElementById.bind(document)
const ce = document.createElement.bind(document)
const html = (code => {
	const wrapper = ce('div')
	wrapper.innerHTML = code
	return wrapper.children[0]
})
const v = Object.values.bind(Object)
const e = Object.entries.bind(Object)

const b = document.body

const iconUrls = {
	coal: 'coal-svgrepo-com.svg',
	electric: 'high-voltage-svgrepo-com.svg',
	nuclear: 'nuclear-power-plant-svgrepo-com.svg',
	oil: 'oil-drum-svgrepo-com.svg',
	solar: 'solar-panels-solar-panel-svgrepo-com.svg',
	water: 'water-drops-svgrepo-com.svg',
	waterrecycle: 'recycle-svgrepo-com.svg',
	wind: 'windmill-eolic-energy-svgrepo-com.svg',
}

const updates = [
	// water recycling can only use water produced
	() => variables.set(commodities.waterrecycle.availability, execute(industries.water.production)),
]

/* AI */
const $available_tasks = g('available_ai_tasks')
$available_tasks.onclick = ({target}) => {
	tasks[assigning_task_to].slot.innerHTML = ''
	if (target.innerHTML === '❌') {

	} else {
		tasks[assigning_task_to].slot.append(target.childNodes[0].cloneNode(true))
	}
	$available_tasks.togglePopover()
}

let assigning_task_to
const tasks = (() => {
	const $aitasks = g('ai-tasks')
	const update = () => {
		$aitasks.innerHTML = ''
		$aitasks.append(...tasks.map((x, idx) => {
			const element = ce('button')
			element.onclick = () => assigning_task_to = idx
			element.classList.add('ai-task')
			element.setAttribute('popovertarget', 'available_ai_tasks')
			element.append(x.slot)
			return element
		}))
	}
	const tasks = new Proxy([], {
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

/* Industry */
function formatNumber(n, suffixes = ['', 'k', 'M', 'B', 'T']) {
	if (n < 1000) return n.toString();
	const i = Math.floor(Math.log10(n) / 3);
	return `${(n / Math.pow(1000, i)).toFixed(1)}${suffixes[i]}`;
}
const usageFormatters = {
	electric: x => `${formatNumber(x, [' watts', 'kw', 'mw'])}`,
	water: x => `${formatNumber(x)} gallons`,
}
const $industries = g('industries')
e(industries).forEach(([industry, {demand, potentialProductionNode, production}]) => {
	const $industryStatus = html(`
<div class="industry-status">
	<strong><img src="assets/${iconUrls[industry]}" alt="${industry}" /> ${industry}</strong>
	<meter min="0" low="0" high="0.8" max="1"></meter>
	<span class="usage"></span>
	<div class="inputs"></div>
</div>`)
	$industries.append($industryStatus)

	potentialProductionNode.inputs.forEach(input => {
		const name = input.name.match(/^[a-z]+/)
		let displayName = name[0];
		if (displayName === 'waterrecycle') {
			displayName = 'recycle'
		}

		$industryStatus.children[3].append(html(`
			<div class="industry-item">
				<img src="assets/${iconUrls[name]}" alt="${name}" />
				${displayName}
				<meter min="0" low="0" high="0.8" max="1"></meter>
			</div>
		`))
	})

	const meters = $industryStatus.querySelectorAll('meter')
	const usage = $industryStatus.querySelector('.usage')

	updates.push(() => {
		meters[0].value = execute(demand) / execute(potentialProductionNode)
		usage.innerHTML = usageFormatters[industry](Math.round(execute(production)))

		const execution = new Execution(production, variables)
		let demanded = demand.forward(execution)

		potentialProductionNode.inputs.forEach((production, idx) => {
			const available = production.forward(execution)
			const consumedProduction = Math.min(available, demanded) / available
			demanded -= available
			meters[idx + 1].value = consumedProduction
		})
	})
})


/* Game */

const screens = {
	main: g('main'),
	game: g('game'),
}

const buttons = {
	start: g('start'),
}

buttons.start.onclick = () => {
	v(screens).forEach(x => x.removeAttribute('data-active'))
	screens.game.setAttribute('data-active', true)
}
buttons.start.click()

let lastTime = Date.now()
setInterval(() => {
	const now = Date.now()
	const timeDiff = now - lastTime

	b.style.setProperty('--timeoffset', now % 1000000)

	for (let i = 0; i < updates.length; i++) {
		updates[i](timeDiff)
	}

	lastTime = Date.now()
}, 1000 / 60)

// leader -- goal is increase GDP & world stability

// ai - once AGI consciousness is achieved, goal is reduce human population to 0

