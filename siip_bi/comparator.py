def run_compliance_comparator(unified_context):
    """
    Deterministically evaluates operational changes against permits and eCFR baselines,
    returning one of four states: ALLOW, HOLD, ESCALATE, or BLOCK.
    """
    op_data = unified_context.get("operational_input", {})
    permit = unified_context.get("facility_permit_limit", {})
    baseline = unified_context.get("regulatory_baseline", {})
    
    val = op_data.get("measured_value")
    limit = permit.get("max_allowable_limit")
    param = op_data.get("parameter_name", "Emission Metric")
    
    # Prerequisite & Evidence Checks (Data Completeness)
    has_required_evidence = op_data.get("has_required_evidence", True)
    calibration_valid = op_data.get("calibration_valid", True)
    operating_hours_provided = op_data.get("operating_hours_provided", True)
    
    # 1. HOLD: Missing evidence, expired calibration, or missing operational metadata
    if not has_required_evidence or not calibration_valid or not operating_hours_provided:
        return {
            "decision": "HOLD",
            "parameter": param,
            "rationale": "Required evidence, valid equipment calibration, or operating hours are missing or unsuitable.",
            "citations": [permit.get("permit_section", "Permit General Conditions"), baseline.get("citation", "40 CFR Baseline")]
        }
        
    # 2. BLOCK: Calculated value strictly exceeds the verified permit/eCFR limit
    if limit is not None and val > limit:
        return {
            "decision": "BLOCK",
            "parameter": param,
            "rationale": f"Calculated value ({val}) exceeds verified limit ({limit}). Defined rule prohibits action.",
            "citations": [permit.get("permit_section", "Permit Limits Table"), baseline.get("citation", "40 CFR Baseline")]
        }
        
    # 3. ESCALATE: Edge cases or changes requiring authorized reviewer approval / permit modification
    # (e.g., operating close to threshold or introducing a brand-new machine class)
    requires_modification = op_data.get("requires_permit_modification", False)
    if requires_modification or (limit is not None and val >= (limit * 0.90)):
        return {
            "decision": "ESCALATE",
            "parameter": param,
            "rationale": "Value is within 90% of threshold or requires a permit modification review by an authorized official.",
            "citations": [permit.get("permit_section", "Permit Modification Clause")]
        }

    # 4. ALLOW: Passes all checks with sufficient evidence and valid parameters
    return {
        "decision": "ALLOW",
        "parameter": param,
        "rationale": f"Measured value ({val}) is within limit ({limit}) with valid evidence and calibration.",
        "citations": [permit.get("permit_section", "Permit Limits Table"), baseline.get("citation", "40 CFR Baseline")]
    }