export const isValidLatLng = (lat: any, lng: any): boolean => {
  // Convert to numbers if they are strings
  const latitude = parseFloat(lat);
  const longitude = parseFloat(lng);

  // Check if they are valid numbers
  if (isNaN(latitude) || isNaN(longitude)) {
    return false;
  }

  // Check for validate range
  return latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
};
