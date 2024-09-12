import {
  Absolute,
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
  _optimize, CombinedSource,
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
function commodity(name, baseCost) {
  const efficiency = new Variable(`${name}Efficiency`)
  const synthesizingAbility = new Variable(`${name}SynthesizingAbility`)
  let input = synthesizingAbility
  let inputAvailability = synthesizingAbility

  let efficiencyModifier = new Add('', One, Zero)
  let demandModifier = new Add('', One, Zero)
  if (temperatureEffects.hasOwnProperty(name)) {
    efficiencyModifier = temperatureEffects[name]
    demandModifier = new Divide('', One, efficiencyModifier)
  }
  const experiencedEfficiency = new Multiply(`${name}Efficiency`, efficiency, efficiencyModifier)

  const actualInput = new Min(`${name}ActualInput`, synthesizingAbility, input)
  const potentialProduction = new Multiply(`${name}PotentialProduction`, actualInput, experiencedEfficiency)

  const demand = new Add(`${name}Demand`)

  const production = new Min(`${name}Production`, demand, potentialProduction)
  production.leaky = true

  const actualAvailability = new Min(`${name}ActualAvailability`, synthesizingAbility, inputAvailability)
  const availableProduction = new Multiply(`${name}AvailableProduction`, actualAvailability, experiencedEfficiency)

  const demandMet = new Divide(`${name}DemandMet`, production, demand)

  const demands = []

  const cost = new Divide('',
    new Constant('', baseCost * 0.56),
    new Log1P('', new Divide('', demand, new Max('', availableProduction, Zero))),
  )
  const ggp = new Multiply(`${name}GGP`, production, cost)

  GGP.include(ggp)

  let converted = false

  return commodities[name] = {
    name,

    synthesizingAbility,

    input,
    efficiency,
    potentialProduction,
    production,

    inputAvailability,
    availableProduction,

    demand,
    demandMet,

    efficiencyModifier,
    demandModifier,

    demands,

    cost,
    ggp,

    from(other, weight) {
      if (!converted) {
        input = new Add(`${name}Input`)
        actualInput.b = input

        inputAvailability = new Add(`${name}InputAvailability`)
        actualAvailability.b = inputAvailability

        commodities[name].input = input
        commodities[name].inputAvailability = inputAvailability

        converted = true
      }

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

      const fulfilled = other.fulfill(demandAmount)
      const unweightedProduction = new Divide(`${name}UnweightedProductionFrom${other.name}`, fulfilled, weightConstant)

      if (input instanceof Add) {
        input.include(unweightedProduction)
      } else {
        input.include([fulfilled, weight])
      }
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

// const windAvailabilityVar = new Variable('WindAvailability')
// const solarAvailabilityVar = new Variable('SolarAvailability')
// const nuclearAvailabilityVar = new Variable('NuclearAvailability')
// const coalAvailabilityVar = new Variable('CoalAvailability')
// const oilAvailabilityVar = new Variable('OilAvailability')

export const activeAiTasks = new Variable('activeAiTasks')
export const aiResearch = new Variable('aiResearch')
export const aiification = new Variable('aiification')
const aiPower = new Power('aiPower', aiification, new Constant('', 5))

const wind = commodity('wind', 2)
const solar = commodity('solar', 1)
const nuclear = commodity('nuclear', 1.5)
const coal = commodity('coal', 5)
const oil = commodity('oil', 15)

const electric = commodity('electric', 3)
const electricDemandFromWindModifier = electric.from(wind, 1)
const electricDemandFromSolarModifier = electric.from(solar, 1)
const electricDemandFromNuclearModifier = electric.from(nuclear, 1)
const electricDemandFromCoalModifier = electric.from(coal, 1)
const electricDemandFromOilModifier = electric.from(oil, 1)
export const electricDemandFromAI = new Add(
  'ElectricDemandFromAI',
  new Multiply('ElectricDemandFromAITasks', new Multiply('', activeAiTasks, aiPower), new Constant('', 1_000_000)),
  new Multiply('ElectricDemandFromAiResearch', aiResearch, new Constant('', 5_000_000))
)
const globalDemandFromAI = new Multiply('GlobalElectricDemandFromAI', aiPower, new Constant('', 1_000_000))
electric.demand.include(electricDemandFromAI, globalDemandFromAI)

const water = commodity('water', 5)
const waterDemandFromElectricModifier = water.from(electric, 0.5)
export const waterDemandFromAI = new Add(
  'WaterDemandFromAI',
  new Multiply('WaterDemandFromAITasks', new Multiply('', activeAiTasks, aiPower), new Constant('', 1_000)),
  new Multiply('WaterDemandFromAiResearch', aiResearch, new Constant('', 5_000))
)
const globalWaterDemandFromAI = new Multiply('GlobalWaterDemandFromAI', aiPower, new Constant('', 1_000))
water.demand.include(waterDemandFromAI, globalWaterDemandFromAI)

const grain = commodity('grain', 15)
const grainDemandFromWaterModifier = grain.from(water, 2)

const meatInput = new CombinedSource('MeatCombinedSource')
const meat = commodity('meat', 50, meatInput)
const meatDemandFromWaterModifier = meat.from(water, 10)
const meatDemandFromGrainModifier = meat.from(grain, 2)

const agri = commodity('agri', 55)
const agriDemandFromGrainModifier = agri.from(grain, 3)
const agriDemandFromMeatModifier = agri.from(meat, 1)

const plastic = commodity('plastic', 7)
const plasticDemandFromOilModifier = plastic.from(oil, 1)

const goodsInput = new CombinedSource('GoodsCombinedSource')
const goods = commodity('goods', 100, goodsInput)
const goodsDemandFromPlasticModifier = goods.from(plastic, 2)
const goodsDemandFromElectricModifier = goods.from(electric, 20)
const goodsDemandFromWaterModifier = goods.from(water, 5)

const materialismVar = new Variable('materialsm')
const materialNeed = new Constant('MaterialNeed', 0.2)
const materialism = new Min('', new Max('', Zero,
  new Add('', materialNeed, materialismVar)
), One)

export const population = new Variable('population')
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

const meatToAgriRatio = new Divide('meatToAgriRatio', commodities.meat.production, commodities.agri.production)
const meatDeviation = new Absolute('', new Subtract('meatDeviation', meatToAgriRatio, new Constant('meatBase', 0.4)))

const healthDetractionFromAgriRatio = new Power('healthDetractionFromAgri', meatDeviation, new Constant('healthDetractionFromAgriPower', 3))
const healthDetractionFromHunger = new Power('healthDetractionFromHunger', new Subtract('', One, commodities.agri.demandMet), new Constant('healthDetractionFromHungerPower', 0.5))
const healthDetractionFromThirst = new Power('healthDetractionFromThirst', new Subtract('', One, commodities.water.demandMet), new Constant('healthDetractionFromThirstPower', 0.5))
const healthDetractionFromMaterialism = new Power('healthDetractionFromMaterialism', materialism, new Constant('healthDetractionFromMaterialismPower', 3))
const healthDetractionFromElectric = new Power('healthDetractionFromElectric', new Subtract('', One, commodities.electric.demandMet), new Constant('', 1))
const health = new Max('', Zero,
  new Subtract('health', One,
    new Add('healthDetractions', healthDetractionFromAgriRatio, healthDetractionFromHunger, healthDetractionFromThirst, healthDetractionFromMaterialism, healthDetractionFromElectric)
  )
)

const healthIndustry = commodity('healthIndustry', 1_000)
const healthIndustryDemandFromHealth = new Power('', new Constant('', 0.1), health)
healthIndustry.demand.include(new Multiply('', population, healthIndustryDemandFromHealth))

const approvalDetractionFromHealth = new Power('', health, new Constant('', 1.5))
const approvalDetractionFromFood = new Power('', new Subtract('', One, commodities.agri.demandMet), new Constant('', 1.5))
const approvalDetractionFromWater = new Power('', new Subtract('', One, commodities.water.demandMet), new Constant('', 1.5))
const approvalDetractionFromGoods = new Power('', new Subtract('', One, commodities.goods.demandMet), new Constant('', 1.5))
const approvalDetractionFromElectric = new Power('', new Subtract('', One, commodities.electric.demandMet), new Constant('', 1.5))
const approval = new Max('approval', Zero,
  new Subtract('', One, new Add('', approvalDetractionFromHealth, approvalDetractionFromFood, approvalDetractionFromWater, approvalDetractionFromGoods, approvalDetractionFromElectric))
)

const healthOverThirty = new Multiply('healthOverThirty', new Max('', Zero, new Subtract('', health, new Constant('healthBase', 0.3))), new Constant('', 100))
const healthUnderThirty = new Multiply('healthUnderThirty', new Max('', Zero, new Subtract('', new Constant('healthBase', 0.3), health)), new Constant('', 100))
export const populationChange = new Subtract('populationChange',
  new Power('', healthOverThirty, new Constant('', 3.45)),
  new Power('', healthUnderThirty, new Constant('', 5.5)),
)

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
  ['pop-', populationChange],
  ['ggp', GGP],
  ['materialism', materialism],
  ['co2ppm', co2ppm],
  ['temperature', temperature],
  ['health', health],
  ['approval', approval],
  ['ai', aiification],
]
society.materialismVar = materialismVar

export let variables = new Map([
  [activeAiTasks, 0],
  [aiResearch, 0],
  [aiification, 1.301029],

  [population, 8_174_511_828],
  [materialismVar, 0.5],
  [co2ppm, 421],
  [temperature, 1.3],

  [wind.synthesizingAbility, 65_000_000_000],
  [wind.efficiency, 1],

  [solar.synthesizingAbility, 65_000_000_000],
  [solar.efficiency, 1],

  [nuclear.synthesizingAbility, 65_000_000_000],
  [nuclear.efficiency, 1],

  [coal.synthesizingAbility, 65_000_000_000],
  [coal.efficiency, 1],

  [oil.synthesizingAbility, 120_000_000_000],
  [oil.efficiency, 1],

  [electric.synthesizingAbility, 1_000_000_000_000_000], // the indivdual inputs are the limiting factor
  [electric.efficiency, 1],
  [electricDemandFromWindModifier, 1],
  [electricDemandFromSolarModifier, 1],
  [electricDemandFromNuclearModifier, 1],
  [electricDemandFromCoalModifier, 1],
  [electricDemandFromOilModifier, 0.0671],

  [plastic.synthesizingAbility, 800_000_000],
  [plastic.efficiency, 1],
  [plasticDemandFromOilModifier, 1],

  [water.synthesizingAbility, 35_000_000_000],
  [water.efficiency, 1],
  [waterDemandFromElectricModifier, 1],

  [goods.synthesizingAbility, 400_000_000],
  [goods.efficiency, 1],
  [goodsDemandFromPlasticModifier, 1],
  [goodsDemandFromElectricModifier, 1],
  [goodsDemandFromWaterModifier, 1],

  [grain.synthesizingAbility, 1_000_000_000_000],
  [grain.efficiency, 1],
  [grainDemandFromWaterModifier, 1],

  [meat.synthesizingAbility, 1_000_000_000_000],
  [meat.efficiency, 1],
  [meatDemandFromWaterModifier, 1],
  [meatDemandFromGrainModifier, 1],

  [agri.synthesizingAbility, 2_600_000_000],
  [agri.efficiency, 1],
  [agriDemandFromGrainModifier, 0.9],
  [agriDemandFromMeatModifier, 0.4],

  [healthIndustry.synthesizingAbility, 1_000_000_000_000], // only exists to create optimization tension
  [healthIndustry.efficiency, 1],
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
        variables.set(modifier, variables.get(modifier) * 0.9)
      })
      optimize(electric.potentialProduction, target, costs, 0.1)
    }
  }

  // console.log(modifiers.map((modifier) => variables.get(modifier)))
  // console.log('now', execute(electric.input))

  // for (let i = 0; i < 20; i++) {
  optimize(electric.availableProduction, target * 1.05, new Map([
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

  if (execute(plastic.availableProduction) < execute(plastic.demand) * 1.2) {
    optimize(plastic.availableProduction, execute(plastic.demand) * 1.2, new Map([
      [oil.efficiency, 1],
      [oil.input, 1],
      [plasticDemandFromOilModifier, 1],
      [electricDemandFromOilModifier, 1],
      ...modifiers.map((modifier) => [modifier, 1])
    ]), 0.1)
  }
}

export function optimizeAgriDemand() {
  if (execute(commodities.agri.demandMet) < 0.99) {
    optimize(commodities.agri.production, execute(commodities.agri.demand) * 1.1, new Map([
      [agriDemandFromGrainModifier, 1],
      [agriDemandFromMeatModifier, 10],
    ]), 0.1)
  } else {
    optimize(meatToAgriRatio, 0.4, new Map([
      [agriDemandFromGrainModifier, 1],
      [agriDemandFromMeatModifier, 1],
    ]), 0.2)
  }
}

export function execute(node, _variables = variables) {
  return new Execution(node, _variables).forward()
}

export function optimize(operation, targetValue, costs, maxCost) {
  variables = _optimize(operation, targetValue, variables, costs, maxCost)
}
