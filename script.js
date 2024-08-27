import {execute, optimize, variables, industries, commodities, society} from './economy.js'
import { Execution } from './imho.js'

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
	agri: 'assets/wheat-barley-svgrepo-com.svg',
	coal: 'assets/coal-svgrepo-com.svg',
	electric: 'assets/high-voltage-svgrepo-com.svg',
	grain: 'assets/wheat-barley-svgrepo-com.svg',
	meat: 'assets/meat-on-bone-svgrepo-com.svg',
	nuclear: 'assets/nuclear-power-plant-svgrepo-com.svg',
	oil: 'assets/oil-drum-svgrepo-com.svg',
	pop: 'assets/people-nearby-svgrepo-com.svg',
	solar: 'assets/solar-panels-solar-panel-svgrepo-com.svg',
	water: 'assets/water-drops-svgrepo-com.svg',
	waterrecycle: 'assets/recycle-svgrepo-com.svg',
	wind: 'assets/windmill-eolic-energy-svgrepo-com.svg',
}

const updates = [
	// execute tasks
	x => tasks.forEach(({ update }) => update?.(x)),

	// water recycling can only use water produced
	() => variables.set(commodities.waterrecycle.availability, execute(industries.water.production)),
]

/* AI */
function assignTask(node, update) {
	const task = tasks[assigning_task_to]
	task.slot.innerHTML = ''

	if (node) {
		task.slot.append(node)
	}
	task.update = update
}

const $available_tasks = g('available_ai_tasks')
const $optimize_tasks = g('available_ai_tasks--optimize');
const $usage_tasks = g('available_ai_tasks--usage');
[
	['wind', 'optimize', (x) => optimize(
		commodities.wind.efficiency, Infinity,
		new Map([
			[commodities.wind.efficiency, () => variables.get(commodities.wind.efficiency) * 1.01]
		]),
		x / 1000
	)],
	['solar', 'optimize', () => {}],
	['nuclear', 'optimize', () => {}],
	['oil', 'optimize', () => {}],
	['coal', 'optimize', () => {}],

	['electric', 'usage', (x) => optimize(
		industries.electric.demand, Infinity,
		variables,
		x / 1000 * 100
	)],
	['water', 'usage', (x) => optimize(
		industries.water.demand, Infinity,
		variables,
		x / 1000 * 100
	)],
	['agri', 'usage', (x) => optimize(
		industries.agri.demand, Infinity,
		variables,
		x / 1000 * 100
	)],
].forEach(([name, where, update]) => {
	const button = html(`<button><span class="resourceGroup"><img src="${iconUrls[name]}" />${name}</span></button>`);
	button.onclick = (e) => {
		const node = e.currentTarget.children[0].cloneNode(true)
		assignTask(node, update);
		$available_tasks.togglePopover()
	};
	if (where === 'optimize') $optimize_tasks.children[1].append(button)
	if (where === 'usage') $usage_tasks.children[1].append(button)
})

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
	agri: x => `${formatNumber(x)} tons`,
}
const $industries = g('industries')
e(industries).forEach(([industry, {demand, potentialProductionNode, production}]) => {
	const $industryStatus = html(`
<div class="industry-status">
	<strong><img src="${iconUrls[industry]}" alt="${industry}" /> ${industry}</strong>
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
				<img src="${iconUrls[name]}" alt="${name}" />
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

/* Society */
const $society = g('society-statuses')
society.forEach(([society, node]) => {
	const $societyStatus = html(`
<div class="society-item">
	<img src="${iconUrls[society]}" alt="${society}" />
	${society}
	<span></span>
</div>`)
	$society.append($societyStatus)

	updates.push(() => {
		$societyStatus.querySelector('span').textContent = formatNumber(Math.floor(execute(node)))
	});
});

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

