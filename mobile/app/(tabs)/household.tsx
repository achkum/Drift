import { View } from 'react-native';
import { MEMBERS } from '@/lib/sample/household';
import { Avatar, Btn, Card, Grow, H1, H2, Icon, List, Row, Screen, T, Tag, useToast } from '../../src/ui/kit';
import { useTheme } from '../../src/ui/theme';

const SOON = 'Available in the next update.';

export default function Household() {
  const { c } = useTheme();
  const toast = useToast();
  return (
    <Screen tabbed>
      <H1>Household</H1>
      <T v="sub" style={{ marginTop: -6 }}>See how feeds drift for the people you live with, only with their say-so.</T>

      <Card style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }}><Icon name="people" size={22} /></View>
          <View style={{ flex: 1 }}>
            <T v="b16">You’re not in a household yet</T>
            <T v="small">Create one for your family, or join one with an invite link. Everyone chooses what they share.</T>
          </View>
        </View>
        <Btn onPress={() => toast(SOON)}>Create a household</Btn>
        <Btn kind="line" onPress={() => toast(SOON)}>Join with an invite link</Btn>
        <T v="tiny" style={{ textAlign: 'center' }}>{SOON} Drift on this phone works fully for you alone in the meantime.</T>
      </Card>

      <H2>Preview with sample people</H2>
      <T v="small" style={{ marginTop: -6 }}>
        <T v="label">PREVIEW  </T>
        These screens show how a household will look, using made-up people and numbers.
      </T>
      <List>
        <Row href="/household/sam" chev label="Sam, sample partner">
          <Avatar text={MEMBERS.sam.initial} kind="sam" />
          <Grow title="Sam" detail="Partner, shares interest drift and ads" titleSize={16} tiny={false} />
        </Row>
        <Row href="/household/maya" chev label="Maya, sample teen, 1 alert">
          <Avatar text={MEMBERS.maya.initial} kind="maya" />
          <Grow title={MEMBERS.maya.displayName} detail="Teen, weekly summary and alerts" titleSize={16} tiny={false} />
          <Tag kind="amber">1 alert</Tag>
        </Row>
        <Row label="Leo, 13, invited">
          <Avatar text="L" kind="leo" />
          <Grow title="Leo, 13" detail="Invited, waiting for Leo to accept" titleSize={16} tiny={false} />
        </Row>
      </List>
      <List>
        <Row href="/household/sharing" chev>
          <Grow title="What you share" detail="Choose what each person can see" titleSize={16} tiny={false} />
        </Row>
        <Row href="/household/compare" chev>
          <Grow title="Household compared" detail="You, Sam and Maya next to other people" titleSize={16} tiny={false} />
        </Row>
      </List>
      <Btn href="/ask?about=household" icon="sparkle">Ask Drift about a sample household</Btn>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="lock" size={14} />
        <T v="tiny">Nothing here uses your data.</T>
      </View>
    </Screen>
  );
}
