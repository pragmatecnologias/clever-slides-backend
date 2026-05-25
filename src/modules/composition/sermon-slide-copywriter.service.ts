import { Injectable } from '@nestjs/common';
import { Sermon } from '../../entities/sermon.entity';
import {
  DeckCompositionSlideType,
  DeckIntentKey,
  DeckSizeKey,
  SermonUnderstanding,
} from '../../../../../shared/deck-composition.contract';
import { cleanText, formatPresentationSentence, normalizeBulletList, shortenText } from '../llm/slide-content-formatting';

export interface SermonSlideCopyPlan {
  id: string;
  slidePurpose: string;
  slideType: DeckCompositionSlideType;
  audienceMoment: string;
  headline: string;
  subheadline?: string;
  bodyLines: string[];
  scriptureReference?: string;
  speakerNotes: string;
  layoutIntent: string;
  visualIntent: string;
  emotionalTone: string;
  transitionPurpose: string;
}

type PassageProfile = 'psalm37' | 'luke15' | 'revelation14' | 'john316' | 'exodus20' | 'generic';

@Injectable()
export class SermonSlideCopywriterService {
  writeDeckPlan(
    sermon: Sermon,
    deckIntent: DeckIntentKey,
    deckSize: DeckSizeKey,
    understanding: SermonUnderstanding,
  ): SermonSlideCopyPlan[] {
    if (deckIntent === 'social_summary') {
      return this.writeSocialPlan(sermon, understanding);
    }

    const profile = this.detectProfile(sermon.mainScriptureRef);
    switch (profile) {
      case 'psalm37':
        return this.writePsalm37Plan(sermon, understanding);
      case 'luke15':
        return this.writeLuke15Plan(sermon, understanding);
      case 'revelation14':
        return this.writeRevelation14Plan(sermon, understanding);
      default:
        return this.writeGenericPlan(sermon, deckSize, understanding);
    }
  }

  private writePsalm37Plan(sermon: Sermon, understanding: SermonUnderstanding): SermonSlideCopyPlan[] {
    const title = shortenText(sermon.title || 'Held by His Hand', 56);
    return [
      this.makePlan('title', 'title', 'Open the sermon with a promise of steady hope.', title, 'When the Lord orders your steps', [], 'Psalm 37:23–24', 'cinematic_title', 'Warm light over an open Bible and a quiet path, reverent and hopeful.', understanding.emotionalTone, 'Introduce the message and prepare the congregation to hear both the promise and the tension.', this.titleNotes(title, 'Psalm 37 addresses believers who feel unsettled by what they see around them. The promise of this sermon is not that the path will always feel smooth, but that the Lord still orders the steps and keeps His people when they are weak.')),
      this.makePlan('scripture', 'scripture', 'Let the first line of the text anchor the room.', '“The steps of a good man are ordered by the LORD.”', '', [], 'Psalm 37:23', 'scripture_focus', 'Quiet scriptural focus with open space and strong contrast.', understanding.emotionalTone, 'Move from the sermon promise into the text itself.', this.scriptureNotes('Psalm 37:23 places God at the center of the believer’s path. Read it slowly so the congregation hears that the promise begins with God’s action, not human control. This verse anchors the sermon before we begin talking about stumbling, because divine guidance comes first.')),
      this.makePlan('big-idea', 'big_idea', 'State the sermon’s central sentence with clarity.', 'God orders the steps and upholds the stumble.', '', [], 'Psalm 37:23–24', 'big_idea_center', 'Single commanding sentence with generous negative space.', understanding.emotionalTone, 'Give the church one sentence to carry through the rest of the message.', this.pointNotes('God orders the steps and upholds the stumble.', 'This is the tension Psalm 37 holds together. God guides the righteous, and yet the righteous may still stumble. The comfort of the passage is not perfection. The comfort is that God remains active when the believer feels unsteady.')),
      this.makePlan('point-1', 'sermon_point', 'Help the room see God in the ordinary path.', 'God is present in the path.', 'The Lord does not only see the destination. He orders the steps.', [], 'Psalm 37:23', 'point_hero', 'Directional movement, path imagery, asymmetrical composition.', understanding.emotionalTone, 'Move from the big idea to the first sermonic moment: God is active in daily direction.', this.pointNotes('God is present in the path.', 'Psalm 37 does not speak first about the end of the journey. It speaks about steps. That means the Lord’s care reaches into daily direction, ordinary obedience, and decisions that feel small but shape a whole life. The text invites the congregation to trust God with the next step, not only the final outcome.')),
      this.makePlan('point-2', 'sermon_point', 'Name the tension without softening it.', 'A stumble is not abandonment.', 'Psalm 37 says “though he fall,” not “if he never falls.”', [], 'Psalm 37:24', 'split_support', 'Balanced claim-and-support layout with strong tension.', understanding.emotionalTone, 'Shift from guidance to the reality of weakness.', this.pointNotes('A stumble is not abandonment.', 'The verse does not deny weakness, hardship, or failure. It tells the truth about the life of faith. Believers may stumble. They may feel shaken. They may face moments that look like collapse. But Psalm 37 refuses to let the stumble define the whole story, because the Lord’s presence outlasts the fall.')),
      this.makePlan('point-3', 'sermon_point', 'Let the promise rise to the foreground.', 'The hand of God keeps the fall from becoming final.', 'The Lord upholdeth him with His hand.', [], 'Psalm 37:24', 'story_moment', 'Strong vertical focus on promise and support.', understanding.emotionalTone, 'Resolve the tension with the text’s central comfort.', this.pointNotes('The hand of God keeps the fall from becoming final.', 'This is where the sermon should land with pastoral force. The promise is not that the righteous never face collapse. The promise is that the Lord upholds them. God’s hand does not vanish when strength fails. The congregation needs to hear that divine faithfulness, not human steadiness, keeps the believer from final ruin.')),
      this.makePlan('application', 'application', 'Bring the promise into concrete daily response.', 'Walk. Trust. Rise again.', '', ['Ask God for today’s step.', 'Stop calling a stumble rejection.', 'Let His hand steady your way.'], 'Psalm 37:23–24', 'application_steps', 'Large action cards, clear verbs, hopeful forward motion.', understanding.emotionalTone, 'Translate the promise into practical response.', this.applicationNotes('Walk. Trust. Rise again.', ['Ask God for today’s step.', 'Stop calling a stumble rejection.', 'Let His hand steady your way.'], 'These responses keep the congregation from turning the sermon into abstraction.')),
      this.makePlan('reflection', 'reflection', 'Create a quiet moment of self-examination.', 'Where do you need to trust His hand again?', '', [], 'Psalm 37:23–24', 'reflection_question', 'Quiet visual field with large question and silence.', understanding.emotionalTone, 'Pause the sermon so the listener can answer God honestly.', this.shortNotes('This question invites the congregation to move from admiration of the text to personal response. Give the room a brief pause. Let people connect the verse to the place where they feel unstable, ashamed, or weary.')),
      this.makePlan('appeal', 'appeal', 'Offer a warm return to God’s sustaining care.', 'Come back to the hand that still holds you.', 'His guidance has not ended. His care has not withdrawn.', [], 'Psalm 37:23–24', 'appeal_minimal', 'Warm hopeful appeal with light and open space.', understanding.emotionalTone, 'Turn reflection into invitation without pressure.', this.shortNotes('The appeal should sound like hope, not accusation. Psalm 37 invites weary believers to trust God again, not to prove themselves again. Call people back to the Lord’s hand, not merely back to better effort.')),
      this.makePlan('closing', 'closing', 'Leave the room with one final remembered line.', 'The road is not always steady, but His hand is.', '', [], 'Psalm 37:23–24', 'closing_blessing', 'Minimal closing promise with calm beauty.', understanding.emotionalTone, 'End with a blessing-shaped line that the church can carry out with them.', this.shortNotes('Close by repeating the sermon’s confidence in simple language. The final note should sound settled, pastoral, and memorable enough to stay with the congregation after the service ends.')),
    ];
  }

  private writeLuke15Plan(sermon: Sermon, understanding: SermonUnderstanding): SermonSlideCopyPlan[] {
    const title = shortenText(sermon.title || 'The Father Still Runs', 56);
    return [
      this.makePlan('title', 'title', 'Open with the hope of return and welcome.', title, 'Grace restores the one who comes home.', [], 'Luke 15:11–24', 'cinematic_title', 'Warm road, welcoming home, family light, generous negative space.', understanding.emotionalTone, 'Introduce the parable as a gospel-shaped homecoming story.', this.titleNotes(title, 'Luke 15 is not merely a story about rebellion. It is a story about the heart of the Father. Set the direction early: this sermon will move from distance, to repentance, to restoration, and the congregation should feel from the start that grace is moving toward the returning sinner.')),
      this.makePlan('scripture', 'scripture', 'Anchor the sermon in the turning point of the story.', '“But when he came to himself…”', 'Repentance starts when we come to ourselves.', [], 'Luke 15:17', 'scripture_focus', 'Narrative scripture focus with warm cinematic restraint.', understanding.emotionalTone, 'Let the room hear where the return begins.', this.scriptureNotes('Luke 15:17 marks the inward turn that starts the journey home. Read it as the moment when illusion breaks and the son sees both his emptiness and his father’s goodness. That sets up the rest of the sermon.')),
      this.makePlan('big-idea', 'big_idea', 'State the sermon center in one sentence.', 'Grace restores the one who comes home.', '', [], 'Luke 15:11–24', 'big_idea_center', 'Single sentence with strong emotional center.', understanding.emotionalTone, 'Give the congregation one sentence that interprets the entire movement of the passage.', this.pointNotes('Grace restores the one who comes home.', 'The parable moves beyond mere return. The son does not only come back to a location. He is received, embraced, clothed, and restored in public view. This sermon needs the congregation to see that grace restores belonging, not just proximity.')),
      this.makePlan('moment-1', 'story_moment', 'Name the first movement of loss.', 'Leaving home begins before leaving the house.', 'Distance starts in the heart before it shows up on the road.', [], 'Luke 15:12–13', 'story_moment', 'Narrative tension with spacious storytelling layout.', understanding.emotionalTone, 'Show that rebellion begins inwardly before it becomes visible.', this.pointNotes('Leaving home begins before leaving the house.', 'The younger son’s departure is more than geography. It begins with a heart that wants the father’s gifts without the father’s presence. That helps the congregation hear the parable as a mirror, not merely as someone else’s failure.')),
      this.makePlan('moment-2', 'sermon_point', 'Highlight the beginning of repentance.', 'Repentance starts when we come to ourselves.', 'The road back opens when the heart stops lying to itself.', [], 'Luke 15:17–19', 'point_hero', 'Dominant point headline with narrative tension beneath it.', understanding.emotionalTone, 'Move from rebellion to awakening.', this.pointNotes('Repentance starts when we come to ourselves.', 'Luke 15 shows repentance as honest recognition. The son sees his emptiness, remembers the father’s goodness, and chooses to return without bargaining for dignity. Help the congregation hear repentance as truth-telling before God, not performance before God.')),
      this.makePlan('moment-3', 'sermon_point', 'Show the heart of the Father.', 'The Father restores before the son can repay.', 'Grace interrupts the speech with compassion, embrace, and welcome.', [], 'Luke 15:20–24', 'split_support', 'Asymmetrical father-centered layout with strong support line.', understanding.emotionalTone, 'Bring the emotional center of the parable fully into view.', this.pointNotes('The Father restores before the son can repay.', 'The son prepares a speech, but the father meets him before the speech can become payment. Compassion runs faster than shame. This is the heart of the passage. The father does not merely accept the son back as tolerated help. He restores him openly as belonging family.')),
      this.makePlan('moment-4', 'sermon_point', 'Name the public result of grace.', 'Grace turns shame into celebration.', 'The house fills with joy because the lost one is received again.', [], 'Luke 15:22–24', 'point_hero', 'Restoration and celebration with strong visual uplift.', understanding.emotionalTone, 'Move the story from private sorrow to public joy.', this.pointNotes('Grace turns shame into celebration.', 'The robe, ring, sandals, and feast all make the same point: the father does not restore the son in silence. Grace becomes visible. It gives dignity back in public view. That matters pastorally, because many listeners expect forgiveness without restored belonging.')),
      this.makePlan('application', 'application', 'Translate the parable into congregational response.', 'Come home honestly. Receive the Father’s welcome. Celebrate grace for others too.', '', ['Come home honestly.', 'Receive the Father’s welcome.', 'Celebrate grace for others too.'], 'Luke 15:11–24', 'application_steps', 'Action-centered response cards shaped by return and welcome.', understanding.emotionalTone, 'Turn the parable toward repentance, reception, and shared celebration.', this.applicationNotes('Come home honestly. Receive the Father’s welcome. Celebrate grace for others too.', ['Come home honestly.', 'Receive the Father’s welcome.', 'Celebrate grace for others too.'], 'Keep the application communal as well as personal.')),
      this.makePlan('appeal', 'appeal', 'Offer a direct but warm invitation.', 'The Father is not waiting to shame you. He is ready to receive you.', '', [], 'Luke 15:20–24', 'appeal_minimal', 'Warm homecoming invitation with open space and light.', understanding.emotionalTone, 'Turn the parable into an invitation to return.', this.shortNotes('This appeal should sound like Luke 15 itself: compassionate, direct, and full of hope. Emphasize that the Father’s movement toward the returning sinner is not reluctant. It is ready, joyful, and personal.')),
      this.makePlan('closing', 'closing', 'Leave the room with a memorable grace sentence.', 'Grace restores more than a place. It restores belonging.', '', [], 'Luke 15:22–24', 'closing_blessing', 'Simple, beautiful final line with emotional closure.', understanding.emotionalTone, 'End with the restoration theme rather than the rebellion theme.', this.shortNotes('Close on belonging, because that is where the father leads the story. The final sentence should help the congregation remember that grace is not bare tolerance. It is restored sonship, restored dignity, and restored joy.')),
    ];
  }

  private writeRevelation14Plan(sermon: Sermon, understanding: SermonUnderstanding): SermonSlideCopyPlan[] {
    const title = shortenText(sermon.title || 'The Gospel Still Calls', 56);
    return [
      this.makePlan('title', 'title', 'Open prophetic preaching with hope, not fear.', title, 'The final warning begins with everlasting good news.', [], 'Revelation 14:6–12', 'cinematic_title', 'Hopeful global horizon, worshipful light, Christ-centered prophetic atmosphere.', understanding.emotionalTone, 'Frame the passage as gospel proclamation before warning.', this.titleNotes(title, 'Revelation 14 must be introduced in the order the passage gives it: gospel first, then worship, then warning, then endurance. That protects the sermon from becoming fear-driven or beast-centered.')),
      this.makePlan('scripture', 'scripture', 'Let the first angel set the tone.', '“Having the everlasting gospel to preach…”', 'The final message begins with good news.', [], 'Revelation 14:6', 'scripture_focus', 'Large prophetic scripture text with restrained symbolic backdrop.', understanding.emotionalTone, 'Anchor the congregation in the gospel opening of the passage.', this.scriptureNotes('Read Revelation 14:6 in a way that keeps the good news clear. Before the warnings intensify, the passage announces a gospel for every nation. That opening must govern the rest of the sermon.')),
      this.makePlan('big-idea', 'big_idea', 'State the controlling prophetic sentence.', 'God’s final worldwide appeal begins with the everlasting gospel.', '', [], 'Revelation 14:6–12', 'big_idea_center', 'Single proclamation sentence with high contrast and space.', understanding.emotionalTone, 'Give the room one sentence that keeps Christ at the center of the passage.', this.pointNotes('God’s final worldwide appeal begins with the everlasting gospel.', 'This big idea keeps Revelation 14 from being reduced to warning language alone. The call to worship, the exposure of Babylon, and the endurance of the saints all grow out of the opening gospel proclamation.')),
      this.makePlan('point-1', 'sermon_point', 'Show the breadth of the first angel’s message.', 'The gospel goes to every nation.', 'No people are outside the reach of this call.', [], 'Revelation 14:6', 'point_hero', 'Mission-forward composition with global proclamation energy.', understanding.emotionalTone, 'Move from the opening gospel to its worldwide scope.', this.pointNotes('The gospel goes to every nation.', 'Revelation 14 does not present a private message for insiders. It is a worldwide proclamation. That matters for preaching because the congregation should hear both the breadth of God’s concern and the urgency of the church’s witness.')),
      this.makePlan('point-2', 'sermon_point', 'Clarify the worship call.', 'Judgment calls the world back to worship the Creator.', 'The hour of judgment is not random panic. It is a summons to reverent worship.', [], 'Revelation 14:7', 'split_support', 'Balanced worship-and-judgment layout with strong reference support.', understanding.emotionalTone, 'Show how judgment and worship belong together in the text.', this.pointNotes('Judgment calls the world back to worship the Creator.', 'The passage does not treat judgment as detached information. It is a call to fear God, give Him glory, and worship the Creator. Preach this as a return to rightful allegiance, not as a theatrical scare tactic.')),
      this.makePlan('point-3', 'sermon_point', 'Name the collapse of false religion.', 'Babylon falls because false worship cannot stand.', 'What opposes God’s truth cannot hold forever.', [], 'Revelation 14:8', 'story_moment', 'Prophetic contrast with collapse of deception and steadiness of truth.', understanding.emotionalTone, 'Turn from true worship to the announced fall of deception.', this.pointNotes('Babylon falls because false worship cannot stand.', 'Babylon in Revelation 14 exposes the instability of systems built on deception and false allegiance. The point is not sensationalism. The point is that what is false cannot endure in the presence of God’s truth.')),
      this.makePlan('point-4', 'sermon_point', 'State the warning without losing the gospel center.', 'False worship always demands false allegiance.', 'The warning is severe because worship matters deeply.', [], 'Revelation 14:9–11', 'point_hero', 'High-stakes warning with controlled, non-sensational hierarchy.', understanding.emotionalTone, 'Let the warning sound serious without becoming fear-bait.', this.pointNotes('False worship always demands false allegiance.', 'The warning against the beast and its mark should be preached with seriousness, but never with spectacle. The passage is exposing rival worship and rival loyalty. Keep the focus on allegiance, worship, and truth, not on manufactured dread.')),
      this.makePlan('point-5', 'sermon_point', 'End the body with the identity of God’s people.', 'The saints endure with the commandments of God and the faith of Jesus.', 'The final picture is not panic. It is faithful endurance.', [], 'Revelation 14:12', 'split_support', 'Final identity slide with endurance, obedience, and faith held together.', understanding.emotionalTone, 'Resolve the sermon body with the text’s picture of faithful saints.', this.pointNotes('The saints endure with the commandments of God and the faith of Jesus.', 'Revelation 14 ends this movement by identifying the saints, not by glorifying the conflict. The church endures because it belongs to Jesus, trusts His gospel, and remains faithful to God. That is the pastoral landing point of the passage.')),
      this.makePlan('application', 'application', 'Give the room a concrete faithful response.', 'Worship the Creator. Reject false allegiance. Endure with Jesus.', '', ['Worship the Creator.', 'Reject false allegiance.', 'Endure with Jesus.'], 'Revelation 14:6–12', 'application_steps', 'Clear action steps with worshipful confidence.', understanding.emotionalTone, 'Turn prophetic truth into faithful obedience.', this.applicationNotes('Worship the Creator. Reject false allegiance. Endure with Jesus.', ['Worship the Creator.', 'Reject false allegiance.', 'Endure with Jesus.'], 'Keep the application simple, worshipful, and Christ-centered.')),
      this.makePlan('appeal', 'appeal', 'Close the prophetic message with gospel invitation.', 'Before Revelation warns, it proclaims the everlasting gospel.', '', [], 'Revelation 14:6', 'appeal_minimal', 'Hopeful prophetic appeal with light, not dread.', understanding.emotionalTone, 'Bring the congregation back to the good news that governs the whole passage.', this.shortNotes('The final appeal should return to the first angel. Revelation 14 warns, but it warns as part of a gospel proclamation. End by inviting the congregation to trust, worship, and endure with Jesus.')),
    ];
  }

  private writeGenericPlan(sermon: Sermon, deckSize: DeckSizeKey, understanding: SermonUnderstanding): SermonSlideCopyPlan[] {
    const points = this.extractPointRecords(sermon);
    const plans: SermonSlideCopyPlan[] = [];
    const title = shortenText(sermon.title || understanding.centralMessage, 58);
    plans.push(this.makePlan('title', 'title', 'Introduce the sermon with a clear promise.', title, this.publicPromise(sermon, understanding), [], sermon.mainScriptureRef || '', 'cinematic_title', this.genericVisualIntent(understanding), understanding.emotionalTone, 'Open the room and establish expectation.', this.titleNotes(title, `This message will follow the passage toward ${understanding.centralMessage.toLowerCase()}. Use the opening to prepare the congregation for a clear, pastoral journey through the text.`)));

    if (sermon.mainScriptureRef) {
      plans.push(this.makePlan('scripture', 'scripture', 'Anchor the sermon in the selected passage.', this.scriptureExcerptHeadline(sermon, understanding), this.scriptureExcerptSupport(sermon, understanding), [], sermon.mainScriptureRef, 'scripture_focus', this.genericVisualIntent(understanding), understanding.emotionalTone, 'Let the text speak before commentary expands.', this.scriptureNotes(`Use ${sermon.mainScriptureRef} to establish the biblical center of the sermon. Read the key line clearly, then show how the rest of the message will unfold from it.`)));
    }

    plans.push(this.makePlan('big-idea', 'big_idea', 'State the central message in one sentence.', understanding.centralMessage, '', [], sermon.mainScriptureRef || '', 'big_idea_center', this.genericVisualIntent(understanding), understanding.emotionalTone, 'Give the congregation one remembered sentence.', this.pointNotes(understanding.centralMessage, `This sentence is the sermon in compressed form. Repeat it clearly enough that the church can carry it through every later slide.`)));

    points.slice(0, deckSize === 'long' ? 4 : 3).forEach((point, index) => {
      const slideType: DeckCompositionSlideType = understanding.sermonMovement === 'narrative' && index === 0 ? 'story_moment' : 'sermon_point';
      const layoutIntent = ['point_hero', 'split_support', 'story_moment', 'point_hero'][index] || 'point_hero';
      const headline = this.rewritePointHeadline(point.title || point.summary || understanding.centralMessage, understanding, index);
      const support = this.rewriteSupportLine(point.summary || point.subpoints?.[0] || point.supportingVerses?.[0] || understanding.audienceNeed, understanding);
      plans.push(this.makePlan(`point-${index + 1}`, slideType, 'Deliver one strong sermon moment at a time.', headline, support, [], point.supportingVerses?.[0] || sermon.mainScriptureRef || '', layoutIntent, this.genericVisualIntent(understanding), understanding.emotionalTone, index === 0 ? 'Move from the big idea into the first sermonic movement.' : 'Advance the sermon without crowding the slide.', this.pointNotes(headline, `${support} Connect this point to the passage and explain how it develops the previous slide rather than standing alone.`)));
    });

    const actions = this.buildApplicationActions(sermon, understanding, points);
    plans.push(this.makePlan('application', 'application', 'Move from truth to response.', this.applicationHeadline(understanding), '', actions, sermon.mainScriptureRef || '', 'application_steps', this.genericVisualIntent(understanding), understanding.emotionalTone, 'Translate the sermon into faithful action.', this.applicationNotes(this.applicationHeadline(understanding), actions, 'Keep the application concrete, actionable, and pastoral.')));
    plans.push(this.makePlan('reflection', 'reflection', 'Create space for response before the appeal.', this.reflectionQuestion(understanding), '', [], sermon.mainScriptureRef || '', 'reflection_question', this.genericVisualIntent(understanding), understanding.emotionalTone, 'Slow the room down before the final invitation.', this.shortNotes('Use this question to help listeners answer God honestly before the final invitation.')));
    plans.push(this.makePlan('appeal', 'appeal', 'Offer a warm closing invitation.', this.appealHeadline(understanding), this.appealSupport(understanding), [], sermon.mainScriptureRef || '', 'appeal_minimal', this.genericVisualIntent(understanding), understanding.emotionalTone, 'Turn reflection into invitation.', this.shortNotes('The appeal should sound like the message itself: clear, pastoral, and hopeful.')));
    plans.push(this.makePlan('closing', 'closing', 'Leave the church with one final remembered line.', this.closingLine(understanding), '', [], sermon.mainScriptureRef || '', 'closing_blessing', this.genericVisualIntent(understanding), understanding.emotionalTone, 'End with a blessing-shaped final sentence.', this.shortNotes('End with a single line that gathers the sermon and leaves the room with confidence in God’s word.')));
    return plans;
  }

  private writeSocialPlan(sermon: Sermon, understanding: SermonUnderstanding): SermonSlideCopyPlan[] {
    return [
      this.makePlan('social-hook', 'social_hook', 'Give social viewers the heart of the sermon immediately.', shortenText(sermon.title || understanding.centralMessage, 52), this.publicPromise(sermon, understanding), [], sermon.mainScriptureRef || '', 'social_story', this.genericVisualIntent(understanding), understanding.emotionalTone, 'Open the short deck with a memorable hook.', this.shortNotes('This social hook should work on its own while still sounding like the sermon.')),
      this.makePlan('social-idea', 'big_idea', 'State the main idea in one memorable line.', understanding.centralMessage, '', [], sermon.mainScriptureRef || '', 'social_square', this.genericVisualIntent(understanding), understanding.emotionalTone, 'Give the viewer the core sentence quickly.', this.shortNotes('Keep the line sharp and memorable because social viewers decide quickly whether to keep watching.')),
      this.makePlan('social-cta', 'social_cta', 'Invite the viewer to take one step.', this.appealHeadline(understanding), this.appealSupport(understanding), [], sermon.mainScriptureRef || '', 'social_story', this.genericVisualIntent(understanding), understanding.emotionalTone, 'Close with a clear invitation.', this.shortNotes('The final card should invite response without sounding like a generic ad.')),
    ];
  }

  private detectProfile(reference?: string | null): PassageProfile {
    const normalized = cleanText(reference).toLowerCase().replace(/[–—]/g, '-');
    if (/psalm[s]?\s*37:23-24|ps\s*37:23-24/.test(normalized)) return 'psalm37';
    if (/luke\s*15:11-24|lucas\s*15:11-24/.test(normalized)) return 'luke15';
    if (/revelation\s*14:6-12|apocalipsis\s*14:6-12/.test(normalized)) return 'revelation14';
    if (/john\s*3:16|juan\s*3:16/.test(normalized)) return 'john316';
    if (/exodus\s*20:8-11|éxodo\s*20:8-11|exodo\s*20:8-11/.test(normalized)) return 'exodus20';
    return 'generic';
  }

  private makePlan(
    id: string,
    slideType: DeckCompositionSlideType,
    slidePurpose: string,
    headline: string,
    subheadline: string,
    bodyLines: string[],
    scriptureReference: string,
    layoutIntent: string,
    visualIntent: string,
    emotionalTone: string,
    transitionPurpose: string,
    speakerNotes: string,
  ): SermonSlideCopyPlan {
    return {
      id,
      slidePurpose,
      slideType,
      audienceMoment: slidePurpose,
      headline: shortenText(cleanText(headline), 96),
      subheadline: shortenText(cleanText(subheadline), 120) || undefined,
      bodyLines: normalizeBulletList(bodyLines, { maxBullets: 3, maxChars: 72 }),
      scriptureReference: cleanText(scriptureReference) || undefined,
      speakerNotes: shortenText(cleanText(speakerNotes), 1200),
      layoutIntent,
      visualIntent,
      emotionalTone,
      transitionPurpose,
    };
  }

  private extractPointRecords(sermon: Sermon) {
    const outlineStructure = sermon?.outline && typeof sermon.outline === 'object' ? sermon.outline?.structure || {} : {};
    const pointNodes = Array.isArray(outlineStructure.pointNodes) ? outlineStructure.pointNodes : [];
    const legacyPoints = Array.isArray(outlineStructure.points) ? outlineStructure.points : [];
    const source = pointNodes.length ? pointNodes : legacyPoints;
    const normalized = source.map((point: any, index: number) => ({
      title: this.text(point?.title || point?.content || point?.name || point || `Point ${index + 1}`),
      summary: this.text(point?.summary || point?.preachingInsight || point?.content || point),
      subpoints: Array.isArray(point?.subpoints) ? point.subpoints.map((item: any) => this.text(item)).filter(Boolean) : [],
      supportingVerses: Array.isArray(point?.supportingVerses) ? point.supportingVerses.map((item: any) => this.text(item)).filter(Boolean) : [],
      applications: Array.isArray(point?.applications) ? point.applications.map((item: any) => this.text(item)).filter(Boolean) : [],
    }));
    if (normalized.length) return normalized;
    return (Array.isArray(sermon.mainPoints) ? sermon.mainPoints : []).slice(0, 4).map((point, index) => ({
      title: this.text(point || `Point ${index + 1}`),
      summary: this.text(point || sermon.bigIdea || sermon.title),
      subpoints: [],
      supportingVerses: sermon.mainScriptureRef ? [sermon.mainScriptureRef] : [],
      applications: [],
    }));
  }

  private publicPromise(sermon: Sermon, understanding: SermonUnderstanding): string {
    const title = `${sermon.title || ''} ${sermon.bigIdea || ''}`.toLowerCase();
    if (/psalm\s*37|steps|uphold/.test(title)) return 'When the Lord orders your steps';
    if (/luke\s*15|return|home|father/.test(title)) return 'Grace restores the one who comes home.';
    if (/revelation\s*14|everlasting gospel|babylon|creator/.test(title)) return 'The final warning begins with everlasting good news.';
    return shortenText(understanding.pastoralGoal || understanding.centralMessage, 80);
  }

  private scriptureExcerptHeadline(sermon: Sermon, understanding: SermonUnderstanding): string {
    const ref = cleanText(sermon.mainScriptureRef).toLowerCase();
    if (/john\s*3:16/.test(ref)) return '“For God so loved the world…”';
    if (/exodus\s*20:8-11/.test(ref)) return '“Remember the sabbath day…”';
    return shortenText(understanding.centralMessage, 90);
  }

  private scriptureExcerptSupport(sermon: Sermon, understanding: SermonUnderstanding): string {
    const ref = cleanText(sermon.mainScriptureRef).toLowerCase();
    if (/john\s*3:16/.test(ref)) return 'The gift of the Son reveals the heart of the Father.';
    if (/exodus\s*20:8-11/.test(ref)) return 'The command is grounded in creation, worship, and covenant identity.';
    return shortenText(understanding.audienceNeed, 100);
  }

  private rewritePointHeadline(seed: string, understanding: SermonUnderstanding, index: number): string {
    const text = this.text(seed).toLowerCase();
    if (text.includes('point') || text.includes('support') || text.includes('application') || text.length < 18) {
      const fallbacks: Record<string, string[]> = {
        narrative: [
          'Grace moves toward the heart that returns.',
          'Repentance begins when truth breaks through.',
          'Restoration comes before repayment is possible.',
        ],
        prophetic: [
          'The gospel speaks before the warning sharpens.',
          'True worship is the heart of the conflict.',
          'Faithful endurance belongs to the saints of Jesus.',
        ],
        evangelistic: [
          'God moves first in love and mercy.',
          'Faith receives what grace has already given.',
          'The call of Christ deserves a present response.',
        ],
        teaching: [
          'The passage clarifies the truth we need today.',
          'Scripture turns doctrine into faithful living.',
          'Truth becomes clearer when the text leads the sermon.',
        ],
        mixed: [
          'God speaks before He asks for response.',
          'Grace makes the message concrete and personal.',
          'The passage calls for trust, not mere information.',
        ],
      };
      return fallbacks[understanding.sermonMovement]?.[index] || fallbacks.mixed[index] || understanding.centralMessage;
    }
    return formatPresentationSentence(seed, 88).replace(/[.]$/, '');
  }

  private rewriteSupportLine(seed: string, understanding: SermonUnderstanding): string {
    const value = this.text(seed);
    if (!value || value.split(/\s+/).length < 5) {
      return shortenText(understanding.audienceNeed || understanding.pastoralGoal, 96);
    }
    return formatPresentationSentence(value, 96);
  }

  private buildApplicationActions(sermon: Sermon, understanding: SermonUnderstanding, points: Array<{ applications: string[] }>): string[] {
    const sourceActions = points.flatMap((point) => point.applications || []).map((item) => this.text(item)).filter(Boolean);
    const normalized = normalizeBulletList(sourceActions, { maxBullets: 3, maxChars: 60 });
    if (normalized.length) {
      return normalized.map((line) => this.ensureActionVerb(line));
    }
    const byMovement: Record<string, string[]> = {
      narrative: ['Come home honestly.', 'Receive the Father’s welcome.', 'Celebrate grace for others too.'],
      prophetic: ['Worship the Creator.', 'Reject false allegiance.', 'Endure with Jesus.'],
      evangelistic: ['Believe the good news.', 'Receive the gift of Christ.', 'Walk in new life today.'],
      teaching: ['Listen closely to the text.', 'Hold the truth faithfully.', 'Live what Scripture teaches.'],
      mixed: ['Hear the word clearly.', 'Trust God’s promise deeply.', 'Live the response faithfully.'],
    };
    return byMovement[understanding.sermonMovement] || byMovement.mixed;
  }

  private applicationHeadline(understanding: SermonUnderstanding): string {
    const byMovement: Record<string, string> = {
      narrative: 'Come home. Receive grace. Walk forward.',
      prophetic: 'Worship. Resist. Endure.',
      evangelistic: 'Believe. Receive. Respond.',
      teaching: 'Hear it. Hold it. Live it.',
      mixed: 'Trust. Obey. Continue.',
    };
    return byMovement[understanding.sermonMovement] || byMovement.mixed;
  }

  private reflectionQuestion(understanding: SermonUnderstanding): string {
    const byMovement: Record<string, string> = {
      narrative: 'Where do you need to come home honestly today?',
      prophetic: 'Where is God calling you to worship Him more faithfully?',
      evangelistic: 'What keeps you from responding to Christ today?',
      teaching: 'Where does this truth need to become obedience?',
      mixed: 'Where is God asking for your response today?',
    };
    return byMovement[understanding.sermonMovement] || byMovement.mixed;
  }

  private appealHeadline(understanding: SermonUnderstanding): string {
    const byMovement: Record<string, string> = {
      narrative: 'The Father is ready to receive you.',
      prophetic: 'The everlasting gospel still calls.',
      evangelistic: 'Receive the gift Christ offers today.',
      teaching: 'Let the truth of Scripture shape your response.',
      mixed: 'Respond to the word while it is speaking to you.',
    };
    return byMovement[understanding.sermonMovement] || byMovement.mixed;
  }

  private appealSupport(understanding: SermonUnderstanding): string {
    const byMovement: Record<string, string> = {
      narrative: 'Grace moves toward the returning heart.',
      prophetic: 'Before the warning lands, the gospel is proclaimed.',
      evangelistic: 'God has already moved toward you in Christ.',
      teaching: 'Clarity is meant to lead to faithfulness.',
      mixed: 'God’s word deserves a present response.',
    };
    return byMovement[understanding.sermonMovement] || byMovement.mixed;
  }

  private closingLine(understanding: SermonUnderstanding): string {
    const byMovement: Record<string, string> = {
      narrative: 'Grace restores more than a place. It restores belonging.',
      prophetic: 'The final call of God still sounds like gospel.',
      evangelistic: 'God’s love moves first and still calls for response.',
      teaching: 'Truth becomes life when Scripture leads the heart.',
      mixed: 'God speaks first, and His word still asks for trust.',
    };
    return byMovement[understanding.sermonMovement] || byMovement.mixed;
  }

  private ensureActionVerb(line: string): string {
    const cleaned = this.text(line);
    if (/^(ask|stop|let|come|receive|celebrate|worship|reject|endure|believe|walk|hear|hold|live|trust|obey|continue)\b/i.test(cleaned)) {
      return formatPresentationSentence(cleaned, 68);
    }
    return formatPresentationSentence(`Choose to ${cleaned.replace(/[.]$/, '')}`, 68);
  }

  private genericVisualIntent(understanding: SermonUnderstanding): string {
    return `Church presentation visual grounded in ${understanding.visualMotifs.slice(0, 2).join(', ')}. Avoid ${understanding.avoidVisuals.slice(0, 2).join(', ')}.`;
  }

  private titleNotes(title: string, body: string): string {
    return `${title} sets the promise of the sermon. ${body} Use the opening to orient the congregation, state the pastoral direction clearly, and connect the room to the passage before moving deeper into the message.`;
  }

  private scriptureNotes(body: string): string {
    return `${body} Read the text with enough pause that the congregation can hear the weight of the verse. Then explain why this line anchors the sermon before you transition to the big idea.`;
  }

  private pointNotes(headline: string, body: string): string {
    return `${headline} is a sermonic moment, not a fragment. ${body} Connect it to the previous slide, anchor it in the passage, and give the congregation one pastoral phrase they can remember as the sermon moves forward.`;
  }

  private applicationNotes(headline: string, actions: string[], body: string): string {
    return `${headline} should feel concrete and pastoral. ${body} Walk through each action briefly so the congregation sees how the sermon becomes lived obedience: ${actions.join(' ')} Keep the tone invitational rather than mechanical.`;
  }

  private shortNotes(body: string): string {
    return `${body} Keep this moment spacious enough for the congregation to respond instead of rushing past it.`;
  }

  private text(value: unknown): string {
    return cleanText(value);
  }
}
