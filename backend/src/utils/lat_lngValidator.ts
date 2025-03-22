import crypto from 'crypto';

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

// Signed coordinates to be passed as cookie to swiggy instmart API
export const generateSignedCoordinate = (value: number, secret: string): string => {
  // Generate HMAC-SHA256 signature
  const signature = crypto.createHmac('sha256', secret).update(value.toString()).digest('base64');

  // Format it into the required structure
  return encodeURIComponent(`s:${value}.${signature}`);
};
