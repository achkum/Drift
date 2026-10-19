import { QLOG } from '@/lib/sample/household';
import { Avatar, Btn, H1, List, Row, Screen, T, PreviewTag } from '../../src/ui/kit';
import { View } from 'react-native';

export default function Questions() {
  return (
    <Screen back="/settings">
      <H1>Questions about you</H1>
      <T v="sub" style={{ marginTop: -6 }}>
        <PreviewTag />
        When someone you share with asks Drift about you, it shows here. Answers are worked out on this phone.
      </T>
      <List>
        {QLOG.map((q, i) => (
          <Row key={i} topAlign>
            <Avatar text={q.initial} kind={q.who === 'Sam' ? 'sam' : 'maya'} size={36} />
            <View style={{ flex: 1, gap: 2 }}>
              <T v="b15">{q.who} asked</T>
              <T v="small">“{q.q}”</T>
              <T v="tiny">{q.meta}</T>
            </View>
          </Row>
        ))}
      </List>
      <Btn kind="secondary" href="/household/sharing">Change who can ask</Btn>
    </Screen>
  );
}
