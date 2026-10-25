/**
 * Self-check for `locationVerificationService`, using the real wordings the platforms returned.
 *
 *   npx ts-node src/scripts/verifyLocationVerification.ts
 *
 * The cases that matter most are the REJECTIONS: this gate exists because Zepto silently served a
 * Bengaluru store for a Gurugram request and the app presented those prices as local. A gate that
 * accepts everything is worse than no gate, because it looks like a guarantee.
 */
import { SearchLocation } from '../platforms/types';
import { checkIfResolvedLocationMatches } from '../services/locationVerificationService';

let failureCount = 0;

const assertVerification = (
  resolvedLocationLabel: string | null,
  requestedLocation: SearchLocation,
  expectedToMatch: boolean,
  caseDescription: string,
): void => {
  const actuallyMatched = checkIfResolvedLocationMatches(resolvedLocationLabel, requestedLocation);
  if (actuallyMatched === expectedToMatch) {
    console.log(`  PASS  ${caseDescription}`);
  } else {
    console.log(
      `  FAIL  ${caseDescription} (expected ${expectedToMatch ? 'match' : 'mismatch'}, got ${actuallyMatched ? 'match' : 'mismatch'})`,
    );
    failureCount += 1;
  }
};

const gurugram: SearchLocation = {
  latitude: 28.4419,
  longitude: 77.0658,
  addressText: 'Sector 45, Gurugram',
  pincode: '122003',
};
const bengaluru: SearchLocation = {
  latitude: 12.9352,
  longitude: 77.6245,
  addressText: 'Koramangala, Bengaluru',
  pincode: '560034',
};

console.log('\nAccepting correct resolutions — a gate that cries wolf gets switched off:');
assertVerification(
  'Block A - Block A, Gurugram, Haryana',
  gurugram,
  true,
  "Zepto's \"Block A - Block A, Gurugram, Haryana\" matches a Sector 45, Gurugram request",
);
assertVerification(
  'Sector 45 - Sector 45, Gurugram, Haryana',
  gurugram,
  true,
  'exact locality wording matches',
);
assertVerification('122003', gurugram, true, 'a bare matching pincode matches');
assertVerification(
  'Koramangala - Koramangala, Bangalore, Karnataka',
  bengaluru,
  true,
  '"Bangalore" matches a "Bengaluru" request (same city, different spelling)',
);
assertVerification(
  '28.4597,77.0282',
  gurugram,
  true,
  "Swiggy's coordinates ~19 km away are the same serving area",
);

console.log('\nRejecting wrong resolutions — the half this gate exists for:');
assertVerification(
  'Koramangala - Koramangala, Bangalore, Karnataka',
  gurugram,
  false,
  'a Bengaluru store for a Gurugram request is REJECTED (the original silent bug)',
);
assertVerification(
  '12.9352,77.6245',
  gurugram,
  false,
  "Swiggy coordinates ~1,700 km away are REJECTED",
);
assertVerification(
  '560034',
  gurugram,
  false,
  'a different stated pincode is REJECTED',
);
assertVerification(
  null,
  gurugram,
  false,
  'a platform that states NOTHING has proved nothing, so it is REJECTED',
);
assertVerification('', gurugram, false, 'an empty label is REJECTED');
assertVerification(
  'India',
  gurugram,
  false,
  '"India" alone distinguishes nothing, so it is REJECTED',
);

console.log(
  failureCount === 0
    ? '\nAll location-verification checks passed.'
    : `\n${failureCount} location-verification check(s) FAILED.`,
);
process.exitCode = failureCount === 0 ? 0 : 1;
