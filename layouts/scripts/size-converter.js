class Size {
	static unitarray = ["o", "Ko", "Mo", "Go", "To"];

	constructor() { }

	static convertToOptimum(opts = {
		size: null,
		accuracy: null,
	}) {
		let value;
		let accuracy;
		let valueUnit = 0;
		if (opts.size) value = opts.size
		if (opts.accuracy) accuracy = opts.accuracy;

		while (value > 1000 && valueUnit < 4) {
			value = parseFloat(value / 1024).toFixed(accuracy);
			valueUnit = valueUnit + 1;
		}

		return {
			value: value,
			unit: Size.unitarray[valueUnit]
		};
	}
}

module.exports = Size;