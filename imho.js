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

export class Min extends Operation {
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
		this.grade(execution, this, gradient)
		const smallestSide = this.a.forward(execution) < this.b.forward(execution) ? this.a : this.b
		return this.a.backward(execution, smallestSide === this.a ? gradient : 0) + this.b.backward(execution, smallestSide === this.b ? gradient : 0)
	}
}

export class Distribution extends Operation {
	constructor(name, production, demand) {
		super(name)
		this.production = production
		this.demand = demand
	}

	forward(execution, fulfillment) {
		if (fulfillment == null) {
			throw new Error('Distribution forward called by non-fulfillment node')
		}
		if (execution.values.has(this)) return execution.values.get(this).get(fulfillment)

		const fulfillments = new Map()
		let available = this.production.forward(execution)

		this.demand.inputs.forEach((input) => {
			const distributed = Math.min(input.forward(execution), available)
			available -= distributed
			fulfillments.set(input, distributed)
		})

		execution.values.set(this, fulfillments)
		return fulfillments.get(fulfillment)
	}

	backward(execution, gradient = 1) {
		this.grade(execution, this, gradient)
		const smallestSide = this.demand.forward(execution) < this.production.forward(execution) ? this.demand : this.production
		return this.demand.backward(execution, smallestSide === this.demand ? gradient : 0) + this.production.backward(execution, smallestSide === this.production ? gradient : 0)
	}
}

export class Fulfillment extends Operation {
	constructor(name, demand, distribution) {
		super(name)
		this.demand = demand
		this.distribution = distribution
	}

	forward(execution) {
		if (execution.values.has(this)) return execution.values.get(this)
		const value = this.distribution.forward(execution, this.demand)
		execution.values.set(this, value)
		return value
	}

	backward(execution, gradient = 1) {
		this.grade(execution, this, gradient)
		return this.distribution.backward(execution, gradient)
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
		const value = this.a.forward(execution) / this.b.forward(execution)
		execution.values.set(this, value)
		return value
	}

	backward(execution, gradient = 1) {
		this.grade(execution, this, gradient)

		const a = this.a.forward(execution)
		const b = this.b.forward(execution)

		const da = this.a.backward(execution, gradient / b)
		const db = this.b.backward(execution, -a * gradient / (b * b))

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

export function optimize(operation, targetValue, variablesIn, costs, maxCost) {
	const execution = new Execution(operation, variablesIn)
	execution.backward()

	const variablesOut = new Map(variablesIn)

	const orderedVariableGradients = [...execution.gradients.entries()]
	.filter(([op]) => op instanceof Variable)
	.map(([op, gradient]) => {
		let cost = costs.get(op)
		if (typeof cost === 'function') cost = cost()
		return [op, gradient, cost]
	})
	.filter(([,,cost]) => cost != null)
	.sort(([, aGrade, aCost], [, bGrade, bCost]) => {
		aGrade = aGrade / aCost
		bGrade = bGrade / bCost
		return bGrade - aGrade
	})

	if (orderedVariableGradients.length === 0) {
		return variablesOut
	}

	const [variable, gradient, cost] = orderedVariableGradients[0]
	if (Math.sign(gradient) !== Math.sign(targetValue)) {
		return variablesOut // if the gradient is in the wrong direction, we can't optimize this variable
	}
	const outDiff = targetValue - execution.forward()

	const diffMax = maxCost / cost
	const valueDiff = Math.min(outDiff / gradient, diffMax)

	variablesOut.set(variable, variablesOut.get(variable) + valueDiff)

	return variablesOut
}