import requests

def search_ecfr_baseline(query_keywords: str):
    """Searches Title 40 (Protection of Environment) of the eCFR."""
    url = "https://www.ecfr.gov/api/search/v1/results.json"
    params = {"query": query_keywords, "filter[titles]": 40}
    res = requests.get(url, params=params)
    
    if res.status_code == 200:
        results = res.json().get("results", [])
        if results:
            top_match = results[0]
            return {
                "citation": f"Title 40 CFR Section {top_match.get('section', 'Unknown')}",
                "heading": top_match.get('heading'),
                "snippet": top_match.get('text', '')[:200]
            }
    return {"citation": "40 CFR Baseline", "snippet": "No specific section matched."}