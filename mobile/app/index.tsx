import { Text, View } from 'react-native';
import { parseExport } from '@/lib/parsers';
import { analyse } from '@/lib/analysis';
export default function Home() {
  void parseExport; void analyse;
  return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><Text>Drift</Text></View>;
}
