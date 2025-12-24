export function applySystemRules(calculatie, rules) {
calculatie.phase_order = rules.phase_order
calculatie.settings = {
stabu_basis: rules.stabu_price_basis,
split_material_labor: rules.material_labor_split,
rounding: rules.rounding,
indexing: rules.indexing_level
}
return calculatie
}
