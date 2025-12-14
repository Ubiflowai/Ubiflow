// utils/gasLogic.js

/**
 * PIPE SIZING HELPER
 * Based on HTM 02-01 Part A - Appendix G - Pressure Loss Tables
 * We use the 15m column (typical branch length) and standard allowable pressure drops:
 * - 400kPa (Oxygen/Air): Table A2 @ ~14kPa drop
 * - 700kPa (Surgical Air): Table A3 @ ~14kPa drop
 * - Vacuum: Table A5 @ ~3.9kPa (30mmHg) drop
 */
const getPipeSize = (flow, type) => {
  if (flow <= 0) return "N/A";

  // Data from Table A2 (Medical Air/Oxygen 400kPa) - 15m run
  if (type === "oxygen" || type === "medical_air") {
    if (flow <= 307) return "12mm Copper"; // Table A2, 12mm @ 15m
    if (flow <= 572) return "15mm Copper"; // Table A2, 15mm @ 15m
    if (flow <= 1656) return "22mm Copper"; // Table A2, 22mm @ 15m
    if (flow <= 3320) return "28mm Copper"; // Table A2, 28mm @ 15m
    if (flow <= 5943) return "35mm Copper"; // Table A2, 35mm @ 15m
    if (flow <= 9963) return "42mm Copper"; // Table A2, 42mm @ 15m
    return "54mm+ (Consult Engineer)";
  }

  // Data from Table A3 (Surgical Air 700kPa) - 15m run
  if (type === "surgical_air") {
    if (flow <= 405) return "12mm Copper"; // Table A3
    if (flow <= 754) return "15mm Copper"; // Table A3
    if (flow <= 2175) return "22mm Copper"; // Table A3
    if (flow <= 4351) return "28mm Copper"; // Table A3
    return "35mm+ (Consult Engineer)";
  }

  // Data from Table A5 (Vacuum) - 15m run @ 3.9kPa drop
  if (type === "vacuum") {
    if (flow <= 60) return "12mm Copper"; // Table A5
    if (flow <= 113) return "15mm Copper"; // Table A5
    if (flow <= 330) return "22mm Copper"; // Table A5
    if (flow <= 666) return "28mm Copper"; // Table A5
    if (flow <= 1198) return "35mm Copper"; // Table A5
    if (flow <= 2016) return "42mm Copper"; // Table A5
    return "54mm+ (Consult Engineer)";
  }

  return "Calc Req";
};

/**
 * MAIN CALCULATION ENGINE
 * Formulas derived from HTM 02-01 Tables 13, 18, 20, 21
 */
export const calculateGasLoad = (roomType, bedCount) => {
  // n = number of beds/treatment spaces
  const n = parseFloat(bedCount) || 0;

  // Initialize results
  let results = {
    oxygen: { flow: 0, formula: "", pipe: "" },
    medicalAir: { flow: 0, formula: "", pipe: "" }, // MA4
    surgicalAir: { flow: 0, formula: "", pipe: "" }, // SA7
    vacuum: { flow: 0, formula: "", pipe: "" }
  };

  if (n <= 0) return results;

  switch (roomType) {
    // --- 1. IN-PATIENT WARD (Tables 13, 18, 21) ---
    case "ward":
      // Oxygen: Table 13 (In-patient accommodation)
      // Qw = 10 + ((n-1) * 6) / 4
      results.oxygen.flow = 10 + ((n - 1) * 6) / 4;
      results.oxygen.formula = "Q = 10 + [(n-1)×6]/4";

      // Medical Air: Table 18 (In-patient accommodation)
      // Qw = 20 + ((n-1) * 10) / 4
      results.medicalAir.flow = 20 + ((n - 1) * 10) / 4;
      results.medicalAir.formula = "Q = 20 + [(n-1)×10]/4";

      // Vacuum: Table 21 (Ward unit)
      // Q = 40 (Flat rate for the ward unit, generally not per bed unless multi-ward)
      // Note: If n > 1 we assume it's one ward unit.
      results.vacuum.flow = 40; 
      results.vacuum.formula = "Q = 40 (Per Ward Unit)";
      break;

    // --- 2. CRITICAL CARE / ICU (Tables 13, 18, 21) ---
    case "icu":
      // Oxygen: Table 13 (Critical care areas)
      // Q = 10 + [(n-1) * 6 * 3] / 4  -> Simplifies to 10 + (n-1)*4.5
      results.oxygen.flow = 10 + ((n - 1) * 6 * 3) / 4;
      results.oxygen.formula = "Q = 10 + [(n-1)×6]×¾";

      // Medical Air: Table 18 (Critical care areas)
      // Q = 80 + [(n-1) * 80] / 2
      results.medicalAir.flow = 80 + ((n - 1) * 80) / 2;
      results.medicalAir.formula = "Q = 80 + [(n-1)×80]/2";

      // Vacuum: Table 21 (Critical care areas)
      // Q = 40 + [(n-1) * 40] / 4
      results.vacuum.flow = 40 + ((n - 1) * 40) / 4;
      results.vacuum.formula = "Q = 40 + [(n-1)×40]/4";
      break;

    // --- 3. OPERATING THEATRE SUITE (Tables 13, 18, 20, 21) ---
    case "theatre":
      // NOTE: Here 'n' is treated as nS (Number of Suites)
      
      // Oxygen: Table 13 (Operating suites - Anaesthetist)
      // Q = 100 + (nS - 1) * 6
      results.oxygen.flow = 100 + (n - 1) * 6;
      results.oxygen.formula = "Q = 100 + (nS-1)×6";

      // Medical Air: Table 18 (Operating suites - Anaesthetist)
      // Q = 40 + [(nS - 1) * 10] / 4
      results.medicalAir.flow = 40 + ((n - 1) * 10) / 4;
      results.medicalAir.formula = "Q = 40 + [(nS-1)×10]/4";

      // Surgical Air: Table 20 (Operating room)
      // Assuming <4 rooms for the formula: Q = 350 + [(n-1) * 350] / 2
      results.surgicalAir.flow = 350 + ((n - 1) * 350) / 2;
      results.surgicalAir.formula = "Q = 350 + [(n-1)×350]/2";

      // Vacuum: Table 21 (Operating suites)
      // Q = 80 + [(nS - 1) * 80] / 2
      results.vacuum.flow = 80 + ((n - 1) * 80) / 2;
      results.vacuum.formula = "Q = 80 + [(nS-1)×80]/2";
      break;

    // --- 4. RECOVERY / POST-ANAESTHESIA (Tables 13, 18, 21) ---
    case "recovery":
      // Oxygen: Table 13 (Operating - Post-anaesthesia recovery)
      // Q = 10 + (n - 1) * 6
      results.oxygen.flow = 10 + (n - 1) * 6;
      results.oxygen.formula = "Q = 10 + (n-1)×6";

      // Medical Air: Table 18 (Operating - Post-anaesthesia recovery)
      // Q = 40 + [(n - 1) * 40] / 4
      results.medicalAir.flow = 40 + ((n - 1) * 40) / 4;
      results.medicalAir.formula = "Q = 40 + [(n-1)×40]/4";

      // Vacuum: Table 21 (Operating - Post-anaesthesia recovery)
      // Q = 40 + [(n - 1) * 40] / 4
      results.vacuum.flow = 40 + ((n - 1) * 40) / 4;
      results.vacuum.formula = "Q = 40 + [(n-1)×40]/4";
      break;

    // --- 5. RESUSCITATION / A&E (Tables 13, 18, 21) ---
    case "resus":
      // Oxygen: Table 13 (A&E Resuscitation)
      // Q = 100 + [(n - 1) * 6] / 4
      results.oxygen.flow = 100 + ((n - 1) * 6) / 4;
      results.oxygen.formula = "Q = 100 + [(n-1)×6]/4";

      // Medical Air: Table 18 (A&E Resuscitation)
      // Q = 40 + [(n - 1) * 20] / 4
      results.medicalAir.flow = 40 + ((n - 1) * 20) / 4;
      results.medicalAir.formula = "Q = 40 + [(n-1)×20]/4";

      // Vacuum: Table 21 (A&E Resuscitation)
      // Q = 40 + [(n - 1) * 40] / 4
      results.vacuum.flow = 40 + ((n - 1) * 40) / 4;
      results.vacuum.formula = "Q = 40 + [(n-1)×40]/4";
      break;

    default:
      break;
  }

  // --- FINAL CALCULATIONS ---
  
  // 1. Round up flows
  results.oxygen.flow = Math.ceil(results.oxygen.flow);
  results.medicalAir.flow = Math.ceil(results.medicalAir.flow);
  results.surgicalAir.flow = Math.ceil(results.surgicalAir.flow);
  results.vacuum.flow = Math.ceil(results.vacuum.flow);

  // 2. Determine Pipe Sizes
  results.oxygen.pipe = getPipeSize(results.oxygen.flow, "oxygen");
  results.medicalAir.pipe = getPipeSize(results.medicalAir.flow, "medical_air");
  results.surgicalAir.pipe = getPipeSize(results.surgicalAir.flow, "surgical_air");
  results.vacuum.pipe = getPipeSize(results.vacuum.flow, "vacuum");

  return results;
};