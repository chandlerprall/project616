import {
	Add,
	Constant,
	Execution,
	Multiply,
	Min,
	Variable,
	Power,
	Divide,
	Distribution,
	Fulfillment,
	_optimize
} from './imho.js'

const population = new Variable('population')

function commodity(name) {
	const availability = new Variable(`${name}Availability`)
	const efficiency = new Variable(`${name}Efficiency`)
	const potentialProduction = new Multiply(`${name}PotentialProduction`, availability, efficiency)

	return {
		availability,
		efficiency,
		potentialProduction,
	}
}

function industry(name, potentialProductionNode) {
	const demand = new Add(`${name}Demand`)
	const production = new Min(`${name}Production`, demand, potentialProductionNode)
	const distribution = new Distribution(`${name}Distribution`, production, demand)
	const demandMet = new Divide(`${name}DemandMet`, potentialProductionNode, demand)
	return {demand, production, distribution, demandMet, potentialProductionNode }
}

export const commodities = {
	coal: commodity('coal'),
	grain: commodity('grain'),
	meat: commodity('meat'),
	nuclear: commodity('nuclear'),
	oil: commodity('oil'),
	solar: commodity('solar'),
	water: commodity('water'),
	waterrecycle: commodity('waterrecycle'),
	wind: commodity('wind'),
}

export const industries = {}

// configure electric industry
industries.electric = industry(
	'electric',
	new Add('ElectricPotentialProduction',
		commodities.wind.potentialProduction,
		commodities.solar.potentialProduction,
		commodities.nuclear.potentialProduction,
		commodities.oil.potentialProduction,
		commodities.coal.potentialProduction,
	)
)

// configure water industry
industries.water = industry(
	'water',
	new Add('WaterPotentialProduction',
		commodities.water.potentialProduction,
		commodities.waterrecycle.potentialProduction,
	)
)
const waterDemandFromPopulation = new Multiply('WaterDemandFromPopulation', population, new Constant('WaterDemandFromPopulationCoefficient', 2))
const waterDemandFromAI = new Multiply('WaterDemandFromAI', new Constant('AI', 10), new Constant('WaterDemandFromAICoefficient', 2))
industries.water.demand.include(
	waterDemandFromPopulation,
	waterDemandFromAI,
)

const electricDemandFromWater = new Multiply('ElectricDemandFromWater', industries.water.demand, new Constant('ElectricDemandFromWaterCoefficient', 5))
const electricDemandFromPopulation = new Multiply('ElectricDemandFromPopulation', population, new Constant('ElectricDemandFromPopulationCoefficient', 3))
industries.electric.demand.include(
	electricDemandFromWater,
	electricDemandFromPopulation,
)

// configure agri industry
industries.agri = industry(
	'agri',
	new Add('AgriPotentialProduction',
		commodities.meat.potentialProduction,
		commodities.grain.potentialProduction,
	)
)

const agriDemandFromPopulation = new Multiply('AgriDemandFromPopulation', population, new Constant('AgriDemandFromPopulationCoefficient', 5))
industries.agri.demand.include(
	agriDemandFromPopulation,
)

const waterDemandFromAgriculture = new Multiply('WaterDemandFromAgriculture', industries.agri.demand, new Constant('WaterDemandFromAgricultureCoefficient', 2))
industries.water.demand.include(waterDemandFromAgriculture)

// electric fulfillment
const waterElectricFulfillment = new Fulfillment('WaterElectricFulfillment', electricDemandFromWater, industries.electric.distribution)
const populationElectricFulfillment = new Fulfillment('PopulationElectricFulfillment', electricDemandFromPopulation, industries.electric.distribution)
const totalElectricFulfillment = new Add('TotalElectricFulfillment', waterElectricFulfillment, populationElectricFulfillment)

// water fulfillment
const populationWaterFulfillment = new Fulfillment('PopulationWaterFulfillment', waterDemandFromPopulation, industries.water.distribution)
const aiWaterFulfillment = new Fulfillment('AIWaterFulfillment', waterDemandFromAI, industries.water.distribution)
const agricultureWaterFulfillment = new Fulfillment('AgricultureWaterFulfillment', waterDemandFromAgriculture, industries.water.distribution)
const totalWaterFulfillment = new Add('TotalWaterFulfillment', populationWaterFulfillment, aiWaterFulfillment, agricultureWaterFulfillment)

export let variables = new Map([
	[population, 1],

	[commodities.coal.availability, 5000],
	[commodities.coal.efficiency, 1],

	[commodities.nuclear.availability, 1000],
	[commodities.nuclear.efficiency, 1],

	[commodities.oil.availability, 2000],
	[commodities.oil.efficiency, 1],

	[commodities.solar.availability, 100],
	[commodities.solar.efficiency, 1],

	[commodities.water.availability, 1000],
	[commodities.water.efficiency, 1],

	[commodities.waterrecycle.availability, 0],
	[commodities.waterrecycle.efficiency, 0.1],

	[commodities.wind.availability, 1000],
	[commodities.wind.efficiency, 1],

	[commodities.grain.availability, 1000],
	[commodities.grain.efficiency, 1],
	[commodities.meat.availability, 1000],
	[commodities.meat.efficiency, 1],
])

const improvementCosts = new Map([
	[population, 1],

	[commodities.coal.availability, () => Math.pow(variables.get(commodities.coal.availability), 1.05)], // these should likely be fully-defined operations
	[commodities.coal.efficiency, () => Math.pow(1000, variables.get(commodities.coal.efficiency))],

	[commodities.nuclear.availability, () => Math.pow(variables.get(commodities.nuclear.availability), 1.05)], // these should likely be fully-defined operations
	[commodities.nuclear.efficiency, () => Math.pow(1000, variables.get(commodities.nuclear.efficiency))],

	[commodities.oil.availability, () => Math.pow(variables.get(commodities.oil.availability), 1.05)], // these should likely be fully-defined operations
	[commodities.oil.efficiency, () => Math.pow(1000, variables.get(commodities.oil.efficiency))],

	[commodities.solar.availability, () => Math.pow(variables.get(commodities.solar.availability), 1.03)],
	[commodities.solar.efficiency, () => Math.pow(1000, variables.get(commodities.solar.efficiency))],

	[commodities.water.availability, () => Math.pow(variables.get(commodities.water.availability), 1.07)],
	[commodities.water.efficiency, () => Math.pow(1000, variables.get(commodities.water.efficiency))],

	[commodities.waterrecycle.availability, () => Math.pow(variables.get(commodities.waterrecycle.availability), 1.07)],
	[commodities.waterrecycle.efficiency, () => Math.pow(1000, variables.get(commodities.waterrecycle.efficiency))],

	[commodities.wind.availability, () => Math.pow(variables.get(commodities.wind.availability), 1.07)],
	[commodities.wind.efficiency, () => Math.pow(1000, variables.get(commodities.wind.efficiency))],
])

export const society = [
	['pop', population],
];

export function execute(node, _variables = variables) {
	return new Execution(node, _variables).forward()
}

export function optimize(operation, targetValue, costs, maxCost) {
	variables = _optimize(operation, targetValue, variables, costs, maxCost)
}