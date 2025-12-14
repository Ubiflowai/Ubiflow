// utils/gasLogic.js

/**
 * PIPE SIZING HELPER
 * Based on HTM 02-01 Part A - Appendix G - Pressure Loss Tables
 * We use the 15m column (typical branch length) as the standard reference.
 */
const getPipeSize = (flow, type) => {
  if (flow <= 0) return "N/A";

  // Data from Table A2 (Medical Air/Oxygen 400kPa) - 15m run
  if (type === "oxygen" || type === "medical_air" || type === "nitrous_oxide") {
    if (flow <= 307) return "12mm Copper";
    if (flow <= 572) return "15mm Copper";
    if (flow <= 1656) return "22mm Copper";
    if (flow <= 3320) return "28mm Copper";
    if (flow <= 5943) return "35mm Copper";
    if (flow <= 9963) return "42mm Copper";
    return "54mm+ (Consult Engineer)";
  }

  // Data from Table A3 (Surgical Air 700kPa) - 15m run
  if (type === "surgical_air") {
    if (flow <= 405) return "12mm Copper";
    if (flow <= 754) return "15mm Copper";
    if (flow <= 2175) return "22mm Copper";
    if (flow <= 4351) return "28mm Copper";
    return "35mm+ (Consult Engineer)";
  }

  // Data from Table A5 (Vacuum) - 15m run @ 3.9kPa drop
  if (type === "vacuum") {
    if (flow <= 60) return "12mm Copper";
    if (flow <= 113) return "15mm Copper";
    if (flow <= 330) return "22mm Copper";
    if (flow <= 666) return "28mm Copper";
    if (flow <= 1198) return "35mm Copper";
    if (flow <= 2016) return "42mm Copper";
    return "54mm+ (Consult Engineer)";
  }

  return "Calc Req";
};

/**
 * MAIN CALCULATION ENGINE
 * Formulas derived from HTM 02-01 Tables 13, 18, 20, 21
 */
export const calculateGasLoad = (roomType, bedCount) => {
  // n = number of beds/treatment spaces/rooms
  const n = parseFloat(bedCount) || 0;

  // Initialize results structure
  let results = {
    oxygen: { flow: 0, formula: "", pipe: "" },
    medicalAir: { flow: 0, formula: "", pipe: "" }, // MA4
    surgicalAir: { flow: 0, formula: "", pipe: "" }, // SA7
    vacuum: { flow: 0, formula: "", pipe: "" }
  };

  if (n <= 0) return results;

  switch (roomType) {
    // --- IN-PATIENT ACCOMMODATION ---
    case "ward_single_4bed": // Table 13: Single 4-bed rooms and treatment room
      results.oxygen.flow = 10 + ((n - 1) * 6) / 4;
      results.oxygen.formula = "Q = 10 + [(n-1)*6]/4";
      results.medicalAir.flow = 20 + ((n - 1) * 10) / 4;
      results.medicalAir.formula = "Q = 20 + [(n-1)*10]/4";
      results.vacuum.flow = 40; // Per Ward Unit
      results.vacuum.formula = "Q = 40 (Per Ward Unit)";
      break;

    case "ward_department": // Table 13: Ward block/department
      // Note: This formula usually requires number of wards (nW), assuming n = beds here is an approximation or n represents wards. 
      // If n represents beds, we stick to the ward formula. If n represents wards:
      // We will assume 'n' here is beds for consistency, but note the limitation.
      // Ideally, for a whole department, we'd need nW. Let's stick to the single ward formula as it's safer for bed input.
      results.oxygen.flow = 10 + ((n - 1) * 6) / 4; 
      results.oxygen.formula = "Q = 10 + [(n-1)*6]/4 (Ward Basis)";
      results.medicalAir.flow = 20 + ((n - 1) * 10) / 4;
      results.medicalAir.formula = "Q = 20 + [(n-1)*10]/4";
      results.vacuum.flow = 40; 
      results.vacuum.formula = "Q = 40";
      break;

    // --- ACCIDENT & EMERGENCY ---
    case "ae_resus": // Resuscitation room
      results.oxygen.flow = 100 + ((n - 1) * 6) / 4;
      results.oxygen.formula = "Q = 100 + [(n-1)*6]/4";
      results.medicalAir.flow = 40 + ((n - 1) * 20) / 4;
      results.medicalAir.formula = "Q = 40 + [(n-1)*20]/4";
      results.vacuum.flow = 40 + ((n - 1) * 40) / 4;
      results.vacuum.formula = "Q = 40 + [(n-1)*40]/4";
      break;

    case "ae_major_treatment": // Major treatment/plaster room
      results.oxygen.flow = 10 + ((n - 1) * 6) / 4;
      results.oxygen.formula = "Q = 10 + [(n-1)*6]/4";
      results.medicalAir.flow = 40 + ((n - 1) * 20) / 4;
      results.medicalAir.formula = "Q = 40 + [(n-1)*20]/4";
      results.vacuum.flow = 40 + ((n - 1) * 40) / 4;
      results.vacuum.formula = "Q = 40 + [(n-1)*40]/4";
      break;

    case "ae_treatment_cubicle": // Treatment room/cubicle
      results.oxygen.flow = 10 + ((n - 1) * 6) / 10;
      results.oxygen.formula = "Q = 10 + [(n-1)*6]/10";
      results.vacuum.flow = 40 + ((n - 1) * 40) / 8;
      results.vacuum.formula = "Q = 40 + [(n-1)*40]/8";
      // No Medical Air specified for cubicles in Table 18 usually, but if needed Q=40
      break;

    // --- OPERATING ---
    case "operating_rooms": // Operating Rooms (n = number of theatres nT)
      results.oxygen.flow = 100 + (n - 1) * 10;
      results.oxygen.formula = "Q = 100 + (nT-1)*10";
      results.medicalAir.flow = 40 + ((n - 1) * 40) / 4;
      results.medicalAir.formula = "Q = 40 + [(nT-1)*40]/4";
      results.vacuum.flow = 80 + ((n - 1) * 80) / 2; // Operating Suites (nS)
      results.vacuum.formula = "Q(suite) = 80 + [(nS-1)*80]/2";
      
      // Surgical Air (Orthopaedic/Neurosurgery only)
      // Table 20: <4 rooms
      if (n < 4) {
          results.surgicalAir.flow = 350 + ((n - 1) * 350) / 2;
          results.surgicalAir.formula = "Q = 350 + [(n-1)*350]/2";
      } else {
          results.surgicalAir.flow = 350 + ((n - 1) * 350) / 4;
          results.surgicalAir.formula = "Q = 350 + [(n-1)*350]/4";
      }
      break;

    case "recovery": // Post-anaesthesia recovery
      results.oxygen.flow = 10 + (n - 1) * 6;
      results.oxygen.formula = "Q = 10 + (n-1)*6";
      results.medicalAir.flow = 40 + ((n - 1) * 10) / 4;
      results.medicalAir.formula = "Q = 40 + [(n-1)*10]/4";
      results.vacuum.flow = 40 + ((n - 1) * 40) / 4;
      results.vacuum.formula = "Q = 40 + [(n-1)*40]/4";
      break;

    // --- MATERNITY ---
    case "maternity_ldrp": // LDRP Rooms (Mother)
      results.oxygen.flow = 10 + ((n - 1) * 6) / 4;
      results.oxygen.formula = "Q = 10 + [(n-1)*6]/4";
      // Baby (2 cots usually) - Table 13: Q = 10 + [(n-1)3/2] - Not added here to keep simple or add as separate option?
      // Keeping to mother load as primary driver.
      results.medicalAir.flow = 40 + ((n - 1) * 40) / 4; // Baby resus usually
      results.medicalAir.formula = "Q = 40 + [(n-1)*40]/4";
      results.vacuum.flow = 40 + ((n - 1) * 40) / 4;
      results.vacuum.formula = "Q = 40 + [(n-1)*40]/4";
      break;

    case "maternity_operating": // Operating Suites (nS)
      results.oxygen.flow = 100 + (n - 1) * 6;
      results.oxygen.formula = "Q = 100 + (nS-1)*6";
      results.medicalAir.flow = 40 + ((n - 1) * 10) / 4;
      results.medicalAir.formula = "Q = 40 + [(nS-1)*10]/4";
      results.vacuum.flow = 80 + ((n - 1) * 80) / 2;
      results.vacuum.formula = "Q = 80 + [(nS-1)*80]/2";
      break;

    case "neonatal": // Neonatal Unit (SCBU)
      results.oxygen.flow = 10 + (n - 1) * 6; // Special care baby unit
      results.oxygen.formula = "Q = 10 + (n-1)*6";
      results.medicalAir.flow = 40 * n; // Q = 40n
      results.medicalAir.formula = "Q = 40n";
      results.vacuum.flow = 40 + ((n - 1) * 40) / 4;
      results.vacuum.formula = "Q = 40 + [(n-1)*40]/4";
      break;

    // --- CRITICAL CARE ---
    case "critical_care": // ICU / CCU / HDU
      // Oxygen: Table 13
      results.oxygen.flow = 10 + ((n - 1) * 6 * 3) / 4;
      results.oxygen.formula = "Q = 10 + [(n-1)*6]*3/4";
      
      // Medical Air: Table 18
      results.medicalAir.flow = 80 + ((n - 1) * 80) / 2;
      results.medicalAir.formula = "Q = 80 + [(n-1)*80]/2";
      
      // Vacuum: Table 21
      results.vacuum.flow = 40 + ((n - 1) * 40) / 4;
      results.vacuum.formula = "Q = 40 + [(n-1)*40]/4";
      break;

    // --- RENAL ---
    case "renal": // Renal
      results.oxygen.flow = 10 + ((n - 1) * 6) / 4;
      results.oxygen.formula = "Q = 10 + [(n-1)*6]/4";
      results.medicalAir.flow = 20 + ((n - 1) * 10) / 4;
      results.medicalAir.formula = "Q = 20 + [(n-1)*10]/4";
      results.vacuum.flow = 40 + ((n - 1) * 40) / 4; // Treated as Qd
      results.vacuum.formula = "Q = 40 + [(n-1)*40]/4";
      break;

    // --- RADIOLOGY ---
    case "radiology": // All anaesthetic and procedures rooms
      results.oxygen.flow = 10 + ((n - 1) * 6) / 3;
      results.oxygen.formula = "Q = 10 + [(n-1)*6]/3";
      results.medicalAir.flow = 40 + ((n - 1) * 40) / 4;
      results.medicalAir.formula = "Q = 40 + [(n-1)*40]/4";
      results.vacuum.flow = 40 + ((n - 1) * 40) / 8;
      results.vacuum.formula = "Q = 40 + [(n-1)*40]/8";
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
