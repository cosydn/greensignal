from pydantic import BaseModel, Field

class ExtractedOperationalData(BaseModel):
    parameter_name: str = Field(description="e.g., NOx Emissions, Wastewater pH, CO2 savings")
    measured_value: float = Field(description="Numeric value extracted from source")
    unit: str = Field(description="Unit of measurement like lbs/hr, ppm, gallons")

class PermitConstraints(BaseModel):
    parameter_name: str
    max_allowable_limit: float
    unit: str
    permit_section: str = Field(description="Reference clause or section in the permit document")