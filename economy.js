import {
	Add,
	Subtract,
	Constant,
	Execution,
	Multiply,
	Min,
	Max,
	Variable,
	Log1P,
	Divide,
	Fulfillment,
	_optimize
} from './imho.js'

const One = new Constant('One', 1);

export const commodities = {}
function commodity(name, baseCost, input = new Add(`${name}Input`), inputAvailability = new Add(`${name}InputAvailability`)) {
	const efficiency = new Variable(`${name}Efficiency`)
	const potentialProduction = new Multiply(`${name}PotentialProduction`, input, efficiency)

	const demand = new Add(`${name}Demand`)
	const production = new Min(`${name}Production`, demand, potentialProduction)
	// production.leaky = true

	const availableProduction = new Multiply(`${name}_AvailableProduction`, inputAvailability, efficiency)

	const demandMet = new Divide(`${name}DemandMet`, production, demand)

	const demands = []

	const nonZeroProduction = new Add('', production, One);
	const cost = new Divide('',
		new Constant('', baseCost),
		new Log1P('', new Divide('', availableProduction, nonZeroProduction)),
	)
	const ggp = new Multiply('GGP', nonZeroProduction, cost)

	return commodities[name] = {
		name,

		input,
		efficiency,
		potentialProduction,
		production,

		inputAvailability,
		availableProduction,

		demand,
		demandMet,

		demands,

		cost,
		ggp,

		from(other, weight) {
			const modifier = new Variable(`${name}DemandFrom${other.name}Modifier`)
			const maxedModifier = new Min(`${name}MaxedDemandFrom${other.name}Modifier`,
				new Max('', modifier, new Constant('', 0)),
				One
			)
			const weightConstant = new Constant(`_${name}WeightFrom${other.name}`, weight)
			const _demandAmount = new Multiply(`${name}WeightedDemandFrom${other.name}`, demand, weightConstant)
			const demandAmount = new Multiply(`${name}ModifiedDemandFrom${other.name}`, _demandAmount, maxedModifier)
			other.demand.include(demandAmount)

			const unweightedProduction = new Divide(`${name}UnweightedProductionFrom${other.name}`, other.fulfill(demandAmount), weightConstant)
			input.include(unweightedProduction)
			inputAvailability.include(new Divide(`${name}InputAvailabilityFrom${other.name}`, other.availableProduction, weightConstant))

			demands.push({ demandAmount, from: other, to: this, fulfillment: unweightedProduction })

			return modifier;
		},

		fulfill(demandToFulfill) {
			const fulfillment = new Fulfillment(`${name}Fulfillment`, production, demand, demandToFulfill)
			return fulfillment
		}
	}
}

const windAvailabilityVar = new Variable('WindAvailability')
const solarAvailabilityVar = new Variable('SolarAvailability')
const nuclearAvailabilityVar = new Variable('NuclearAvailability')
const coalAvailabilityVar = new Variable('CoalAvailability')
const oilAvailabilityVar = new Variable('OilAvailability')

const wind = commodity('wind', 2, windAvailabilityVar, windAvailabilityVar)
const solar = commodity('solar', 1, solarAvailabilityVar, solarAvailabilityVar)
const nuclear = commodity('nuclear', 1.5, nuclearAvailabilityVar, nuclearAvailabilityVar)
const coal = commodity('coal', 5, coalAvailabilityVar, coalAvailabilityVar)
const oil = commodity('oil', 10, oilAvailabilityVar, oilAvailabilityVar)

const electric = commodity('electric', 1)
const electricDemandFromWindModifier = electric.from(wind, 1)
const electricDemandFromSolarModifier = electric.from(solar, 1)
const electricDemandFromNuclearModifier = electric.from(nuclear, 1)
const electricDemandFromCoalModifier = electric.from(coal, 1)
const electricDemandFromOilModifier = electric.from(oil, 1)

const water = commodity('water', 1)
const waterDemandFromElectricModifier = water.from(electric, 0.5)

const plastic = commodity('plastic', 1)
const plasticDemandFromOilModifier = plastic.from(oil, 1)

const goods = commodity('goods', 1)
const goodsDemandFromPlasticModifier = goods.from(plastic, 1)
const goodsDemandFromElectricModifier = goods.from(electric, 1)
const goodsDemandFromWaterModifier = goods.from(water, 1)

const population = new Variable('population')
electric.demand.include(new Multiply('', population, new Constant('', 2)))
plastic.demand.include(new Multiply('', population, new Constant('', 0.5)))
water.demand.include(new Multiply('', population, new Constant('', 0.5)))
goods.demand.include(new Multiply('', population, new Constant('', 0.5)))

export const society = [
	['pop', population]
]

export let variables = new Map([
	[population, 10_000],

	[wind.input, 10000], // 10000
	[wind.efficiency, 1],

	[solar.input, 2000], // 2000
	[solar.efficiency, 1],

	[nuclear.input, 10000], // 10000
	[nuclear.efficiency, 1],

	[coal.input, 10000], // 1000
	[coal.efficiency, 1],

	[oil.input, 12000], // 12000
	[oil.efficiency, 1],

	[electric.efficiency, 1],
	[electricDemandFromWindModifier, 0],
	[electricDemandFromSolarModifier, 0],
	[electricDemandFromNuclearModifier, 0],
	[electricDemandFromCoalModifier, 0],
	[electricDemandFromOilModifier, 0],

	[plastic.efficiency, 1],
	[plasticDemandFromOilModifier, 1],

	[water.efficiency, 1],
	[waterDemandFromElectricModifier, 1],

	[goods.efficiency, 1],
	[goodsDemandFromPlasticModifier, 1],
	[goodsDemandFromElectricModifier, 1],
	[goodsDemandFromWaterModifier, 1],
])

window.optimizeElectricDemand = optimizeElectricDemand;
export function optimizeElectricDemand() {
	window.variables = variables
	window.commodities = commodities
	window.society = society
	window.execute = execute

	const modifiers = [
		electricDemandFromWindModifier,
		electricDemandFromSolarModifier,
		electricDemandFromNuclearModifier,
		electricDemandFromCoalModifier,
		electricDemandFromOilModifier
	];
	const target = execute(electric.demand)
	const costs = new Map([
		[electricDemandFromWindModifier, () => execute(commodities.wind.cost)],
		[electricDemandFromSolarModifier, () => execute(commodities.solar.cost)],
		[electricDemandFromNuclearModifier, () => execute(commodities.nuclear.cost)],
		[electricDemandFromCoalModifier, () => execute(commodities.coal.cost)],
		[electricDemandFromOilModifier, () => execute(commodities.oil.cost)],
	]);

	const potentialProduction = execute(electric.potentialProduction);
	if (potentialProduction < target) {
		optimize(electric.potentialProduction, target, costs, 0.1)
	} else {
		modifiers.forEach(modifier => {
			variables.set(modifier, variables.get(modifier) * 0.99)
		})
		optimize(electric.potentialProduction, target * 1, costs, 0.1)
	}
	optimize(electric.potentialProduction, target, costs, 0.1)

	// normalize
	const total = modifiers.reduce((acc, modifier) => acc + variables.get(modifier), 0)
	if (total > 1) {
		// modifiers.forEach((modifier) => variables.set(modifier, variables.get(modifier) / total))
		// console.log(modifiers.reduce((acc, modifier) => acc + variables.get(modifier), 0))
	}

	// console.log(modifiers.map((modifier) => variables.get(modifier)))
	// console.log('now', execute(electric.input))

	optimize(electric.availableProduction, target * 1.2, new Map([
		[coal.efficiency, 1],
		[coal.input, () => execute(commodities.coal.cost)],
		[wind.efficiency, 1],
		[wind.input, () => execute(commodities.wind.cost)],
		[solar.efficiency, 1],
		[solar.input, () => execute(commodities.solar.cost)],
		[nuclear.efficiency, 1],
		[nuclear.input, () => execute(commodities.nuclear.cost)],
		[oil.efficiency, 1],
		[oil.input, () => execute(commodities.oil.cost)],
	]), 0.001)

	optimize(oil.availableProduction, target * 1.2, new Map([
		[oil.efficiency, 1],
		[oil.input, 1],
	]), 0.001)


	// optimize(plastic.demandMet, 1, new Map([
	// 	// [oil.efficiency, 1],
	// 	// [oil.input, 1],
	// 	[plasticDemandFromOilModifier, 1],
	// 	[electricDemandFromOilModifier, 1],
	// 	// [population, 0.1],
	// 	...modifiers.map((modifier) => [modifier, 1])
	// ]), 1)
}

export function execute(node, _variables = variables) {
	return new Execution(node, _variables).forward()
}

export function optimize(operation, targetValue, costs, maxCost) {
	variables = _optimize(operation, targetValue, variables, costs, maxCost)
}