const DEFAULT_DISTANCE_MULTIPLIERS = {
  '0Km-100Km': 1.00,
  '100Km-400Km': 1.10,
  '400Km-800Km': 1.20,
  '>800Km': 1.25
};

function round2(n) {
  if (n === null || n === undefined || isNaN(n)) return null;
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

async function getPortionForDate(contractorName, doneDate) {
  const ruleDate = doneDate ? new Date(doneDate) : new Date();
  const rules = await db.contractor_portions.where('contractor_name').equals(contractorName).toArray();
  const eligible = rules.filter(r => new Date(r.valid_from) <= ruleDate);

  if (eligible.length === 0) {
    return { lmpPct: null, warning: `No portion rule for ${contractorName}. Portions will be empty.` };
  }

  const rule = eligible.reduce((latest, r) => new Date(r.valid_from) > new Date(latest.valid_from) ? r : latest);
  return { lmpPct: rule.lmp_pct, contractorPct: rule.contractor_pct, ruleId: rule.id };
}

async function getDistanceMultiplier(distanceValue) {
  if (!distanceValue) return 1.00;

  const setting = await db.app_settings.get('dropdown_distance');
  if (setting && setting.value) {
    const match = setting.value.find(band => band.band === distanceValue);
    if (match && typeof match.multiplier === 'number') return match.multiplier;
  }

  return DEFAULT_DISTANCE_MULTIPLIERS[distanceValue] ?? 1.00;
}

async function calculateTaskFinancials(task) {
  const warnings = [];
  const priceDate = task.done_date || new Date();

  let newPrice = null;
  let catalogYear = task.catalog_year ?? null;

  if (task.new_price_overridden) {
    newPrice = round2(task.new_price);
  } else {
    const priceResult = await getPriceForDate(task.line_item_code, priceDate);
    newPrice = round2(priceResult.price);
    catalogYear = priceResult.catalogYear ?? null;
    if (priceResult.warning) warnings.push(priceResult.warning);
  }

  let actualQuantity = null;
  if (task.actual_quantity_overridden) {
    actualQuantity = round2(task.actual_quantity);
  } else {
    const multiplier = await getDistanceMultiplier(task.distance);
    actualQuantity = round2((task.absolute_quantity || 0) * multiplier);
  }

  let newTotalPrice = null;
  if (task.new_total_price_overridden) {
    newTotalPrice = round2(task.new_total_price);
  } else if (newPrice !== null && actualQuantity !== null) {
    newTotalPrice = round2(newPrice * actualQuantity);
  }

  let lmpPortion = task.lmp_portion_overridden ? round2(task.lmp_portion) : null;
  let contractorPortion = task.contractor_portion_overridden ? round2(task.contractor_portion) : null;
  let portionRuleId = task.portion_rule_id ?? null;

  if (!task.lmp_portion_overridden || !task.contractor_portion_overridden) {
    const portionResult = await getPortionForDate(task.contractor, priceDate);
    if (portionResult.warning) {
      warnings.push(portionResult.warning);
    } else {
      portionRuleId = portionResult.ruleId;
      if (!task.lmp_portion_overridden && newTotalPrice !== null) {
        lmpPortion = round2(newTotalPrice * (portionResult.lmpPct / 100));
      }
      if (!task.contractor_portion_overridden && newTotalPrice !== null) {
        contractorPortion = round2(newTotalPrice * (portionResult.contractorPct / 100));
      }
    }
  }

  return {
    price_snapshot: newPrice,
    actual_quantity: actualQuantity,
    new_total_price: newTotalPrice,
    lmp_portion: lmpPortion,
    contractor_portion: contractorPortion,
    catalog_year: catalogYear,
    portion_rule_id: portionRuleId,
    warnings
  };
}

window.getPortionForDate = getPortionForDate;
window.getDistanceMultiplier = getDistanceMultiplier;
window.calculateTaskFinancials = calculateTaskFinancials;
window.round2 = round2;
