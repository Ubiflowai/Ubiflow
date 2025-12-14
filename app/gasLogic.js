// utils/gasLogic.js

// 1. Helper: The Pipe Sizer (Your code)
export const recommendPipe = (flowRate) => {
    if (flowRate <= 0) return "N/A";
    if (flowRate <= 40) return "12mm Copper";
    if (flowRate <= 110) return "15mm Copper";
    if (flowRate <= 350) return "22mm Copper";
    if (flowRate <= 800) return "28mm Copper";
    if (flowRate <= 1500) return "35mm Copper";
    return "42mm+ (Detailed Calc Req)";
  };
  
  // 2. Main Calculation Engine
  export const calculateGasLoad = (roomType, bedCount) => {
    const n = parseFloat(bedCount) || 0;
    
    // Initialize results structure
    let results = {
      oxygen: { flow: 0, note: "", pipe: "" },
      air: { flow: 0, note: "", pipe: "" },
      vacuum: { flow: 0, note: "", pipe: "" }
    };
  
    if (n <= 0) return results;
  
    // --- OXYGEN LOGIC (Using your specific HTM formulas) ---
    switch (roomType) {
      case "ward":
        // Formula: 10 + ((n-1) * 6) / 4
        results.oxygen.flow = 10 + ((n - 1) * 6) / 4;
        results.oxygen.note = "HTM 02-01 Ward Diversity (Low Flow)";
        
        // Ward Vacuum: Approx 5L/min with diversity
        results.vacuum.flow = 5 + ((n - 1) * 5) * 0.3; // 30% diversity on remaining
        results.vacuum.note = "Standard Ward Suction";
        break;
  
      case "icu_standard":
        // Formula: 20 + ((n-1) * 10)
        results.oxygen.flow = 20 + ((n - 1) * 10);
        results.oxygen.note = "HTM 02-01 Critical Care Diversity";
        
        // ICU Air: Ventilators require MA4 (approx 20L/min)
        results.air.flow = n * 20; 
        results.air.note = "Ventilator Drive Gas (MA4)";
  
        // ICU Vacuum: High suction (approx 40L/min)
        results.vacuum.flow = n * 40;
        break;
  
      case "icu_high_flow":
        // Formula: 60L per bed flat
        results.oxygen.flow = n * 60;
        results.oxygen.note = "High Flow Protocol (No Diversity)";
        
        // High Flow often implies heavy ventilator use
        results.air.flow = n * 40; // Higher buffer for MA4
        results.air.note = "High Dependency Vent Support";
  
        results.vacuum.flow = n * 50; 
        break;
  
      case "theatre":
        // Formula: 100 + ((n-1) * 20)
        results.oxygen.flow = 100 + ((n - 1) * 20);
        results.oxygen.note = "Surgical Priority Load";
        
        // Theatre Air: Tools & Anesthesia (High)
        results.air.flow = n * 40;
        results.air.note = "Surgical Tools / Anesthesia";
  
        // Theatre Vacuum: Scavenging + Suction (Very High)
        results.vacuum.flow = n * 120;
        break;
        
      default:
        break;
    }
  
    // --- FINAL PIPE SIZING ---
    // We attach the pipe recommendation to every gas result here
    results.oxygen.pipe = recommendPipe(results.oxygen.flow);
    results.air.pipe = recommendPipe(results.air.flow);
    results.vacuum.pipe = recommendPipe(results.vacuum.flow);
  
    // Round flows for clean display
    results.oxygen.flow = Math.ceil(results.oxygen.flow);
    results.air.flow = Math.ceil(results.air.flow);
    results.vacuum.flow = Math.ceil(results.vacuum.flow);
  
    return results;
  };