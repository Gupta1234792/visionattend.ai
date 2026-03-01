export type AddressParts = {
  building: string;
  road: string;
  area: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
};

export const emptyAddressParts: AddressParts = {
  building: "",
  road: "",
  area: "",
  city: "",
  state: "",
  pincode: "",
  country: "India",
};

export function parseAddressString(address?: string | null): AddressParts {
  if (!address) return { ...emptyAddressParts };

  const tokens = address
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  const parsed: AddressParts = { ...emptyAddressParts };
  if (tokens.length === 0) return parsed;

  parsed.building = tokens[0] || "";
  parsed.road = tokens[1] || "";

  if (tokens.length >= 5) {
    parsed.area = tokens[2] || "";
    parsed.city = tokens[3] || "";
    parsed.state = tokens[4] || "";
    parsed.pincode = tokens[5] || "";
    parsed.country = tokens[6] || "India";
  } else {
    parsed.city = tokens[2] || "";
    parsed.state = tokens[3] || "";
    parsed.pincode = tokens[4] || "";
    parsed.country = tokens[5] || "India";
  }

  const pincodeMatch = address.match(/\b\d{6}\b/);
  if (pincodeMatch) parsed.pincode = pincodeMatch[0];

  return parsed;
}

export function composeAddress(parts: AddressParts): string {
  return [
    parts.building.trim(),
    parts.road.trim(),
    parts.area.trim(),
    parts.city.trim(),
    parts.state.trim(),
    parts.pincode.trim(),
    parts.country.trim(),
  ]
    .filter(Boolean)
    .join(", ");
}

export function addressLines(parts: AddressParts): string[] {
  return [
    parts.building,
    parts.road,
    parts.area,
    `${parts.city}${parts.city && parts.state ? ", " : ""}${parts.state}`,
    `${parts.pincode}${parts.pincode && parts.country ? ", " : ""}${parts.country}`,
  ]
    .map((line) => line.trim())
    .filter(Boolean);
}
