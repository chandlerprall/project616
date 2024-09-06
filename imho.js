export class Operation {
  constructor(name) {
    this.name = name
  }

  forward(execution) {
    throw new Error(`forward not implemented for ${this.constructor.name}`)
  }

  backward(execution) {
    throw new Error(`backward not implemented for ${this.constructor.name}`)
  }

  grade(execution, operation, gradient) {
    if (operation instanceof Constant || operation.name == null) return
    if (!execution.gradients.has(operation)) {
      execution.gradients.set(operation, gradient)
    } else {
      execution.gradients.set(operation, execution.gradients.get(operation) + gradient)
    }
  }
}

export class Constant extends Operation {
  constructor(name, value) {
    super(name)
    this.value = value
  }

  forward(execution) {
    return this.value
  }

  backward(execution, gradient = 1) {
    if (gradient == 0) return 0
    this.grade(execution, this, gradient)
    return 0
  }
}

export class Variable extends Operation {
  constructor(name) {
    super(name)
  }

  forward(execution) {
    if (!execution.variables.has(this)) {
      throw new Error(`Execution does not contain variable ${this.name}`)
    }
    return execution.variables.get(this)
  }

  backward(execution, gradient = 1) {
    if (gradient == 0) return 0
    this.grade(execution, this, gradient)
    return 1
  }
}

export class Power extends Operation {
  constructor(name, a, b) {
    super(name)
    this.a = a
    this.b = b
  }

  forward(execution) {
    if (execution.values.has(this)) return execution.values.get(this)
    const value = Math.pow(this.a.forward(execution), this.b.forward(execution))
    execution.values.set(this, value)
    return value
  }

  backward(execution, gradient = 1) {
    if (gradient == 0) return 0
    if (Number.isNaN(gradient)) debugger
    this.grade(execution, this, gradient)
    const x = this.a.forward(execution)
    const n = this.b.forward(execution)

    const a = n * Math.pow(x, n - 1) * gradient
    const b = Math.pow(x, n) * Math.log(x) * gradient

    this.a.backward(execution, a)
    this.b.backward(execution, b)

    return n * Math.pow(x, n - 1)
  }
}

export class Log1P extends Operation {
  constructor(name, x) {
    super(name)
    this.x = x
  }

  forward(execution) {
    if (execution.values.has(this)) return execution.values.get(this)
    const value = Math.log1p(this.x.forward(execution))
    execution.values.set(this, value)
    if (Number.isNaN(value)) debugger
    return value
  }

  backward(execution, gradient = 1) {
    if (gradient == 0) return 0
    if (Number.isNaN(gradient)) debugger
    this.grade(execution, this, gradient)
    const x = this.x.forward(execution)

    const dx = gradient / (1 + x)

    this.x.backward(execution, dx)

    return dx
  }
}

export class Add extends Operation {
  constructor(name, ...inputs) {
    super(name)
    this.inputs = inputs
  }

  forward(execution) {
    if (execution.values.has(this)) return execution.values.get(this)
    let value = 0
    for (const input of this.inputs) {
      value += input.forward(execution)
    }
    execution.values.set(this, value)
    return value
  }

  backward(execution, gradient = 1) {
    if (gradient == 0) return 0
    if (Number.isNaN(gradient)) debugger
    this.grade(execution, this, gradient)
    let result = 0
    for (const input of this.inputs) {
      result += input.backward(execution, gradient)
    }
    return result
  }

  include(...inputs) {
    this.inputs.push(...inputs)
  }
}

export class Subtract extends Operation {
  constructor(name, a, b) {
    super(name)
    this.a = a
    this.b = b
  }

  forward(execution) {
    if (execution.values.has(this)) return execution.values.get(this)
    const value = this.a.forward(execution) - this.b.forward(execution)
    execution.values.set(this, value)
    return value
  }

  backward(execution, gradient = 1) {
    if (gradient == 0) return 0
    if (Number.isNaN(gradient)) debugger
    this.grade(execution, this, gradient)
    const a = this.a.forward(execution)
    const b = this.b.forward(execution)
    const da = this.a.backward(execution, a * gradient)
    const db = this.b.backward(execution, b * -gradient)
    return da - db
  }
}

export class Min extends Operation {
  leaky = false

  constructor(name, a, b) {
    super(name)
    this.a = a
    this.b = b
  }

  forward(execution) {
    if (execution.values.has(this)) return execution.values.get(this)
    const value = Math.min(this.a.forward(execution), this.b.forward(execution))
    execution.values.set(this, value)
    return value
  }

  backward(execution, gradient = 1) {
    if (gradient == 0) return 0
    if (Number.isNaN(gradient)) debugger
    this.grade(execution, this, gradient)
    const aVal = this.a.forward(execution)
    const bVal = this.b.forward(execution)
    const smallestSide = aVal === bVal ? null : (aVal < bVal ? this.a : this.b)
    const aGradient = smallestSide !== this.b ? gradient : (this.leaky ? 0.00001 : 0)
    const bGradient = smallestSide !== this.a ? gradient : (this.leaky ? 0.00001 : 0)
    return this.a.backward(execution, aGradient) + this.b.backward(execution, bGradient)
  }
}

export class Max extends Operation {
  constructor(name, a, b) {
    super(name)
    this.a = a
    this.b = b
  }

  forward(execution) {
    if (execution.values.has(this)) return execution.values.get(this)
    const value = Math.max(this.a.forward(execution), this.b.forward(execution))
    execution.values.set(this, value)
    return value
  }

  backward(execution, gradient = 1) {
    if (gradient == 0) return 0
    if (Number.isNaN(gradient)) debugger
    this.grade(execution, this, gradient)
    const aVal = this.a.forward(execution)
    const bVal = this.b.forward(execution)
    const biggestSide = aVal === bVal ? null : (aVal > bVal ? this.a : this.b)
    const aGradient = biggestSide !== this.b ? gradient : 0
    const bGradient = biggestSide !== this.a ? gradient : 0
    return this.a.backward(execution, aGradient) + this.b.backward(execution, bGradient)
  }
}

export class Fulfillment extends Operation {
  constructor(name, production, demand, demandToFulfill) {
    super(name)
    this.production = production
    this.demand = demand
    this.demandToFulfill = demandToFulfill
  }

  forward(execution) {
    if (execution.values.has(this)) return execution.values.get(this)
    let available = this.production.forward(execution)
    for (const input of this.demand.inputs) {
      const distributed = Math.min(input.forward(execution), available)
      if (input === this.demandToFulfill) {
        execution.values.set(this, distributed)
        return distributed
      }
      available -= distributed
    }
  }

  backward(execution, gradient = 1) {
    if (gradient == 0) return 0
    if (Number.isNaN(gradient)) debugger
    this.grade(execution, this, gradient)
    const demanded = this.demandToFulfill.forward(execution)
    const fulfilled = this.forward(execution)

    if (fulfilled === demanded) {
      this.demand.backward(execution, gradient)
      // this.production.backward(execution, 0.00001)
    } else {
      this.production.backward(execution, gradient)
      this.demandToFulfill.backward(execution, gradient)
    }
  }
}

export class Multiply extends Operation {
  constructor(name, a, b) {
    super(name)
    this.a = a
    this.b = b
  }

  forward(execution) {
    if (execution.values.has(this)) return execution.values.get(this)
    const value = this.a.forward(execution) * this.b.forward(execution)
    execution.values.set(this, value)
    return value
  }

  backward(execution, gradient = 1) {
    if (gradient == 0) return 0
    if (Number.isNaN(gradient)) debugger
    this.grade(execution, this, gradient)

    const a = this.a.forward(execution)
    const b = this.b.forward(execution)

    const da = this.a.backward(execution, b * gradient)
    const db = this.b.backward(execution, a * gradient)

    return a * db + da * b
  }
}

export class Divide extends Operation {
  constructor(name, a, b) {
    super(name)
    this.a = a
    this.b = b
  }

  forward(execution) {
    if (execution.values.has(this)) return execution.values.get(this)
    let value = this.a.forward(execution) / this.b.forward(execution)
    if (Number.isNaN(value) || value === Infinity) value = 0
    execution.values.set(this, value)
    return value
  }

  backward(execution, gradient = 1) {
    if (gradient == 0) return 0
    if (Number.isNaN(gradient)) debugger
    this.grade(execution, this, gradient)

    const a = this.a.forward(execution)
    const b = this.b.forward(execution)

    const da = this.a.backward(execution, gradient / b)
    const db = this.b.backward(execution, Math.max(-a * gradient / (b * b), 0))

    return da + db
  }
}

export class Execution {
  gradients = new Map()
  values = new Map()

  constructor(operation, variables = new Map()) {
    this.operation = operation
    this.variables = variables
  }

  forward() {
    return this.operation.forward(this)
  }

  backward() {
    return this.operation.backward(this)
  }

  get variableGradients() {
    return Array.from(this.gradients.entries()).filter(([node]) => node instanceof Variable)
  }
}

export function _optimize(operation, targetValue, variablesIn, costs, maxCost) {
  const execution = new Execution(operation, variablesIn)
  execution.backward()

  const variablesOut = new Map(variablesIn)

  const targetDiff = targetValue - execution.forward()
  if (targetDiff === 0) return variablesIn
  // const sortOrder = Math.sign(targetDiff);

  const orderedVariableGradients = [...execution.gradients.entries()]
    .filter(([op]) => op instanceof Variable)
    .map(([op, gradient]) => {
      let cost = costs.get(op)
      if (typeof cost === 'function') cost = cost()
      return [op, gradient, cost]
    })
    .filter(([, , cost]) => cost != null)
    .sort(([, aGrade, aCost], [, bGrade, bCost]) => {
      aGrade = aGrade / aCost
      bGrade = bGrade / bCost
      // return sortOrder === 1 ? bGrade - aGrade : aGrade - bGrade
      return bGrade - aGrade
    })

  // debugger;
  if (orderedVariableGradients.length === 0) {
    return variablesOut
  }
  // console.log(orderedVariableGradients[0][0].name)

  const [variable, gradient, cost] = orderedVariableGradients[0]
  // debugger;
  // console.log(orderedVariableGradients, Math.sign(gradient), Math.sign(targetValue))

  // if (Math.sign(gradient) !== Math.sign(targetDiff)) {
  // return variablesOut // if the gradient is in the wrong direction, we can't optimize this variable
  // }

  const targetCost = Math.abs(targetDiff) * cost
  const costRatio = (Math.min(targetCost, maxCost) / targetCost) || 0
  const affordedDiff = targetDiff * costRatio

  if (Number.isNaN(targetCost)) debugger
  if (Number.isNaN(costRatio)) {
    console.log(costRatio, targetCost, maxCost, targetDiff)
    debugger
  }
  if (Number.isNaN(affordedDiff)) debugger

  variablesOut.set(variable, variablesOut.get(variable) + affordedDiff)

  return variablesOut
}