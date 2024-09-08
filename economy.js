import {
  Add,
  Subtract,
  Constant,
  Execution,
  Multiply,
  Min,
  Max,
  Variable,
  Power,
  Log1P,
  Divide,
  Fulfillment,
  _optimize,
} from './imho.js'

const Zero = new Constant('Zero', 0);
const One = new Constant('One', 1);

const GGP = new Add('GGP');

export const co2ppm = new Variable('co2ppm')
export const temperature = new Variable('temperature')
const temperatureDeviation = new Subtract('temperatureDeviation', temperature, new Constant('temperatureBase', 1.2))

const temperatureEffects = {
  grain: new Subtract('',
    One,
    new Power(`temperatureDeviationEffectOnGrain`,
      temperatureDeviation,
      new Constant('temperatureDeviationEffectOnGrainPower', 0.99)
    )
  )
}

export const commodities = {}
function commodity(name, baseCost, input = new Add(`${name}Input`), inputAvailability = new Add(`${name}InputAvailability`)) {
  const efficiency = new Variable(`${name}Efficiency`)

  let efficiencyModifier = new Add('', One, Zero)
  let demandModifier = new Add('', One, Zero)
  if (temperatureEffects.hasOwnProperty(name)) {
    efficiencyModifier = temperatureEffects[name]
    demandModifier = new Divide('', One, efficiencyModifier)
  }
  const experiencedEfficiency = new Multiply(`${name}Efficiency`, efficiency, efficiencyModifier)

  const potentialProduction = new Multiply(`${name}PotentialProduction`, input, experiencedEfficiency)

  const demand = new Add(`${name}Demand`)

  const _production = new Min(`${name}Production`, demand, potentialProduction)
  let production = _production
  if (temperatureEffects.hasOwnProperty(name)) {
    // production
  }
  // production.leaky = true

  const _availableProduction = new Multiply(`${name}_AvailableProduction`, inputAvailability, experiencedEfficiency)
  const availableProduction = _availableProduction;

  const demandMet = new Divide(`${name}DemandMet`, production, demand)

  const demands = []

  const cost = new Divide('',
    new Constant('', baseCost * 0.56),
    new Log1P('', new Divide('', demand, new Max('', _availableProduction, Zero))),
  )
  const ggp = new Multiply(`${name}GGP`, production, cost)

  GGP.include(ggp)

  return commodities[name] = {
    name,

    input,
    efficiency,
    potentialProduction,
    production,

    inputAvailability,
    availableProduction,
    _availableProduction,

    demand,
    demandMet,

    efficiencyModifier,
    demandModifier,

    demands,

    cost,
    ggp,

    from(other, weight) {
      const modifier = new Variable(`${name}DemandFrom${other.name}Modifier`)
      const maxedModifier = new Min(`${name}MaxedDemandFrom${other.name}Modifier`,
        new Max('', modifier, Zero),
        One
      )
      const weightConstant = new Constant(`_${name}WeightFrom${other.name}`, weight)
      const weightedDemand = new Multiply(`${name}WeightedDemandFrom${other.name}`, demand, weightConstant)
      const _demandAmount = new Multiply(`${name}WeightedDemandFrom${other.name}`, weightedDemand, demandModifier)
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
const oil = commodity('oil', 15, oilAvailabilityVar, oilAvailabilityVar)

const electric = commodity('electric', 3)
const electricDemandFromWindModifier = electric.from(wind, 1)
const electricDemandFromSolarModifier = electric.from(solar, 1)
const electricDemandFromNuclearModifier = electric.from(nuclear, 1)
const electricDemandFromCoalModifier = electric.from(coal, 1)
const electricDemandFromOilModifier = electric.from(oil, 1)

const water = commodity('water', 5)
const waterDemandFromElectricModifier = water.from(electric, 0.5)

const grain = commodity('grain', 15)
const grainDemandFromWaterModifier = grain.from(water, 2)

const meat = commodity('meat', 50)
const meatDemandFromWaterModifier = meat.from(water, 3)
const meatDemandFromGrainModifier = meat.from(grain, 2)

const agri = commodity('agri', 55)
const agriDemandFromGrainModifier = agri.from(grain, 3)
const agriDemandFromMeatModifier = agri.from(meat, 1)

const plastic = commodity('plastic', 7)
const plasticDemandFromOilModifier = plastic.from(oil, 1)

const goods = commodity('goods', 100)
const goodsDemandFromPlasticModifier = goods.from(plastic, 1)
const goodsDemandFromElectricModifier = goods.from(electric, 1)
const goodsDemandFromWaterModifier = goods.from(water, 1)

const materialismVar = new Variable('materialsm')
const materialNeed = new Constant('MaterialNeed', 0.2)
const materialism = new Min('', new Max('', Zero,
  new Add('', materialNeed, materialismVar)
), One)

const population = new Variable('population')
const populationMaterialism = new Multiply('', population, materialism)
electric.demand.include(new Multiply('', population, new Constant('', 34.25))) // 12,500 kWh/year
water.demand.include(new Multiply('', population, new Constant('', 0.16))) // 144 liters/day
agri.demand.include(new Multiply('', populationMaterialism, new Constant('', 0.43)))
goods.demand.include(new Multiply('', populationMaterialism, new Constant('', 0.067)))

const co2Increase = new Add(
  'co2increase',
  new Multiply('co2FromCoal', coal.production, new Constant('coalCo2', 1.043 / 1000)),
  new Multiply('co2FromOil', oil.production, new Constant('oilCo2', 1.08 / 1000)),
)
export const co2ppmIncrease = new Divide('co2ppmIncrease', co2Increase, new Constant('co2ToPpm', 30_000_000 * 365))
export const temperatureIncrease = new Multiply('temperatureIncrease', co2ppmIncrease, new Constant('co2IncreaseToTemperature', 0.1 * 0.1))

export const allModifiers = {
  electricDemandFromWindModifier,
  electricDemandFromSolarModifier,
  electricDemandFromNuclearModifier,
  electricDemandFromCoalModifier,
  electricDemandFromOilModifier,
  plasticDemandFromOilModifier,
  waterDemandFromElectricModifier,
  goodsDemandFromPlasticModifier,
  goodsDemandFromElectricModifier,
  goodsDemandFromWaterModifier,
  grainDemandFromWaterModifier,
  meatDemandFromWaterModifier,
  meatDemandFromGrainModifier,
  agriDemandFromGrainModifier,
  agriDemandFromMeatModifier,
}

export const society = [
  ['pop', population],
  ['ggp', GGP],
  ['materialism', materialism],
  ['co2ppm', co2ppm],
  ['temperature', temperature],
]
society.materialismVar = materialismVar

export let variables = new Map([
  [population, 8_174_511_828],
  [materialismVar, 0.5],
  [co2ppm, 421],
  [temperature, 1.3],

  [wind.input, 65_000_000_000],
  [wind.efficiency, 1],

  [solar.input, 65_000_000_000],
  [solar.efficiency, 1],

  [nuclear.input, 65_000_000_000],
  [nuclear.efficiency, 1],

  [coal.input, 65_000_000_000],
  [coal.efficiency, 1],

  [oil.input, 120_000_000_000],
  [oil.efficiency, 1],

  [electric.efficiency, 1],
  [electricDemandFromWindModifier, 1],
  [electricDemandFromSolarModifier, 1],
  [electricDemandFromNuclearModifier, 1],
  [electricDemandFromCoalModifier, 0.18420375896346108],
  [electricDemandFromOilModifier, 0.12222344790657301],

  [plastic.efficiency, 1],
  [plasticDemandFromOilModifier, 1],

  [water.efficiency, 1],
  [waterDemandFromElectricModifier, 1],

  [goods.efficiency, 1],
  [goodsDemandFromPlasticModifier, 1],
  [goodsDemandFromElectricModifier, 1],
  [goodsDemandFromWaterModifier, 1],

  [grain.efficiency, 1],
  [grainDemandFromWaterModifier, 1],

  [meat.efficiency, 1],
  [meatDemandFromWaterModifier, 1],
  [meatDemandFromGrainModifier, 1],

  [agri.efficiency, 1],
  [agriDemandFromGrainModifier, 1],
  [agriDemandFromMeatModifier, 1],
])

window.optimizeElectricDemand = optimizeElectricDemand;
export function optimizeElectricDemand() {
  window.variables = variables
  window.commodities = commodities
  window.modifiers = allModifiers
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

  for (let i = 0; i < 10; i++) {
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
  }

  // console.log(modifiers.map((modifier) => variables.get(modifier)))
  // console.log('now', execute(electric.input))

  // for (let i = 0; i < 20; i++) {
  optimize(electric._availableProduction, target * 1.2, new Map([
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
  ]), 0.01)
  // }

  if (execute(plastic._availableProduction) < execute(plastic.demand) * 1.2) {
    optimize(plastic._availableProduction, execute(plastic.demand) * 1.2, new Map([
      [oil.efficiency, 1],
      [oil.input, 1],
      [plasticDemandFromOilModifier, 1],
      [electricDemandFromOilModifier, 1],
      ...modifiers.map((modifier) => [modifier, 1])
    ]), 0.1)
  }
}

export function execute(node, _variables = variables) {
  return new Execution(node, _variables).forward()
}

export function optimize(operation, targetValue, costs, maxCost) {
  variables = _optimize(operation, targetValue, variables, costs, maxCost)
}
