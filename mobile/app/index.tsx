import { Redirect } from 'expo-router';
import { isOnboarded } from '../src/ui/theme';

export default function Index() {
  return <Redirect href={isOnboarded() ? '/home' : '/onboarding/welcome'} />;
}
