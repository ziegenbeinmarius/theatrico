import { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { Annotation, AnnotationType, CueContent, CueType } from '@theatrico/shared';

const CUE_TYPES: { value: CueType; label: string; icon: string }[] = [
  { value: 'lighting', label: 'Lighting', icon: '💡' },
  { value: 'sound', label: 'Sound', icon: '🔊' },
  { value: 'stage_direction', label: 'Stage dir.', icon: '🎭' },
  { value: 'custom', label: 'Custom', icon: '⚡' },
];

function parseCueContent(raw: string): CueContent {
  try {
    return JSON.parse(raw) as CueContent;
  } catch {
    return { cue_type: 'custom', description: raw };
  }
}

interface Props {
  visible: boolean;
  annotation: Annotation | null;
  lineLabel: string;
  onSave: (type: AnnotationType, content: string) => void;
  onDelete?: (id: number) => void;
  onClose: () => void;
  isPending?: boolean;
}

export function AnnotationSheet({
  visible,
  annotation,
  lineLabel,
  onSave,
  onDelete,
  onClose,
  isPending,
}: Props) {
  const isEditing = annotation !== null;
  const initialType: AnnotationType = annotation?.type === 'cue' ? 'cue' : 'note';
  const initialCue = annotation?.type === 'cue' ? parseCueContent(annotation.content) : null;

  const [type, setType] = useState<AnnotationType>(initialType);
  const [noteContent, setNoteContent] = useState(
    annotation?.type === 'note' ? annotation.content : '',
  );
  const [cueType, setCueType] = useState<CueType>(initialCue?.cue_type ?? 'lighting');
  const [cueDescription, setCueDescription] = useState(initialCue?.description ?? '');

  const isValid = type === 'note' ? noteContent.trim().length > 0 : cueDescription.trim().length > 0;

  function handleSave() {
    if (!isValid || isPending) return;
    if (type === 'note') {
      onSave('note', noteContent.trim());
    } else {
      const cueContent: CueContent = { cue_type: cueType, description: cueDescription.trim() };
      onSave('cue', JSON.stringify(cueContent));
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/60" onPress={onClose} />

      <View className="bg-app-dark rounded-t-2xl border-t border-[#3d2430]">
        {/* Handle */}
        <View className="items-center pt-3 pb-1">
          <View className="w-10 h-1 rounded-full bg-[#3d2430]" />
        </View>

        {/* Header */}
        <View className="flex-row items-start justify-between px-4 py-3 border-b border-[#3d2430]">
          <View className="flex-1 mr-3">
            <Text className="text-base font-bold text-app-text">
              {isEditing ? 'Edit annotation' : 'Add annotation'}
            </Text>
            <Text className="text-[12px] text-app-muted mt-0.5" numberOfLines={1}>
              {lineLabel}
            </Text>
          </View>
          <Pressable onPress={onClose} className="px-2 py-1">
            <Text className="text-app-muted text-xl leading-none">×</Text>
          </Pressable>
        </View>

        <ScrollView className="px-4 pt-4 pb-2" keyboardShouldPersistTaps="handled">
          {/* Type toggle */}
          <View className="flex-row gap-2 mb-4">
            {(['note', 'cue'] as const).map((t) => (
              <Pressable
                key={t}
                onPress={() => setType(t)}
                className={`flex-1 py-2 rounded-lg items-center border ${
                  type === t
                    ? 'bg-app-accent border-app-accent'
                    : 'border-[#3d2430] bg-app-card'
                }`}
              >
                <Text
                  className={`text-sm font-semibold ${
                    type === t ? 'text-white' : 'text-app-muted'
                  }`}
                >
                  {t === 'note' ? '📝 Note' : '⚡ Cue'}
                </Text>
              </Pressable>
            ))}
          </View>

          {type === 'note' ? (
            <TextInput
              className="bg-app-card rounded-xl px-4 py-3 text-app-text text-[15px] min-h-[100px]"
              placeholder="Enter note…"
              placeholderTextColor="#6b5060"
              multiline
              textAlignVertical="top"
              value={noteContent}
              onChangeText={setNoteContent}
              autoFocus
            />
          ) : (
            <View className="gap-3">
              {/* Cue sub-type grid */}
              <View className="flex-row flex-wrap gap-2">
                {CUE_TYPES.map((ct) => (
                  <Pressable
                    key={ct.value}
                    onPress={() => setCueType(ct.value)}
                    className={`flex-row items-center gap-1.5 px-3 py-2 rounded-lg border ${
                      cueType === ct.value
                        ? 'bg-[#2a0f1a] border-app-accent'
                        : 'bg-app-card border-[#3d2430]'
                    }`}
                  >
                    <Text className="text-base">{ct.icon}</Text>
                    <Text
                      className={`text-[13px] font-medium ${
                        cueType === ct.value ? 'text-app-accent' : 'text-app-muted'
                      }`}
                    >
                      {ct.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {/* Description */}
              <TextInput
                className="bg-app-card rounded-xl px-4 py-3 text-app-text text-[15px] min-h-[80px]"
                placeholder="Describe the cue…"
                placeholderTextColor="#6b5060"
                multiline
                textAlignVertical="top"
                value={cueDescription}
                onChangeText={setCueDescription}
                autoFocus
              />
            </View>
          )}

          {/* Actions */}
          <View className="flex-row items-center justify-between mt-4 mb-6">
            {isEditing && onDelete && annotation ? (
              <Pressable
                onPress={() => onDelete(annotation.id)}
                disabled={isPending}
                className="px-4 py-2.5 rounded-xl bg-[#3a0000] border border-[#7a0000]"
              >
                <Text className="text-[13px] font-semibold text-[#ff6666]">Delete</Text>
              </Pressable>
            ) : (
              <View />
            )}
            <View className="flex-row gap-2">
              <Pressable
                onPress={onClose}
                className="px-4 py-2.5 rounded-xl bg-app-card border border-[#3d2430]"
              >
                <Text className="text-[13px] font-semibold text-app-muted">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleSave}
                disabled={!isValid || isPending}
                className={`px-5 py-2.5 rounded-xl ${
                  isValid && !isPending ? 'bg-app-accent' : 'bg-[#5a1020] opacity-50'
                }`}
              >
                <Text className="text-[13px] font-bold text-white">
                  {isPending ? 'Saving…' : isEditing ? 'Save' : 'Add'}
                </Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}
