import json
from models import ExtractedOperationalData, PermitConstraints
from extractors import extract_structured_input
from retriever import search_ecfr_baseline
from comparator import run_compliance_comparator

def main():
    # Mock messy unstructured inputs provided by user
    raw_bill_text = "Monthly Environmental Log: Boiler #2 recorded NOx emissions running at 18.5 lbs per hour for November."
    raw_permit_text = "Operating Permit PA-990 Section 3.2: Stationary gas combustion units shall not exceed a maximum NOx emission limit of 15.0 lbs per hour."
    
    print("--- Step 1: Extracting Data via Gemini ---")
    extracted_operation = extract_structured_input(raw_bill_text, ExtractedOperationalData)
    extracted_permit = extract_structured_input(raw_permit_text, PermitConstraints)
    
    print("--- Step 2: Fetching Guardrails via eCFR API ---")
    ecfr_reference = search_ecfr_baseline("stationary gas turbine NOx emission limits")
    
    # Assemble Unified Context JSON Object
    unified_json_context = {
        "operational_input": extracted_operation,
        "facility_permit_limit": extracted_permit,
        "regulatory_baseline": ecfr_reference
    }
    
    print("\n--- Step 3: Unified Context JSON Constructed ---")
    print(json.dumps(unified_json_context, indent=2))
    
    print("\n--- Step 4: Running Deterministic Comparator ---")
    final_audit_report = run_compliance_comparator(unified_json_context)
    print(json.dumps(final_audit_report, indent=2))

if __name__ == "__main__":
    main()