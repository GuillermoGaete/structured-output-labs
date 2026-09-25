"""A conversation instead of a prompt: the pure helpers behind the replay mode."""

from __future__ import annotations

from app.chat import fit_template, plain_transcript, to_gemini, with_hint


def test_a_single_user_message_is_sent_as_its_own_text():
    assert plain_transcript([{"role": "user", "content": "Tell me a joke"}]) == "Tell me a joke"


def test_a_conversation_without_a_template_is_a_labelled_transcript():
    text = plain_transcript(
        [
            {"role": "system", "content": "Be brief."},
            {"role": "user", "content": "Hi"},
            {"role": "assistant", "content": "Hello."},
            {"role": "user", "content": "Bye"},
        ]
    )
    assert text == "System: Be brief.\n\nUser: Hi\n\nAssistant: Hello.\n\nUser: Bye\n\nAssistant:"


def test_the_hint_goes_to_the_last_user_message():
    msgs = [{"role": "system", "content": "S"}, {"role": "user", "content": "A"}, {"role": "assistant", "content": "B"}, {"role": "user", "content": "C"}]
    out = with_hint(msgs, "JSON please")
    assert out[-1] == {"role": "user", "content": "C\n\nJSON please"}
    assert msgs[-1]["content"] == "C", "the input is not mutated"
    assert out[:3] == msgs[:3]


def test_the_hint_after_a_trailing_system_message_is_a_new_turn():
    out = with_hint([{"role": "user", "content": "A"}, {"role": "system", "content": "S"}], "JSON please")
    assert out[-1] == {"role": "user", "content": "JSON please"}
    assert out[0]["content"] == "A"


def test_fit_template_folds_system_and_merges_runs():
    msgs = [
        {"role": "system", "content": "S1"},
        {"role": "system", "content": "S2"},
        {"role": "user", "content": "U1"},
        {"role": "user", "content": "U2"},
        {"role": "assistant", "content": "A"},
        {"role": "user", "content": "U3"},
    ]
    fitted, notes = fit_template(msgs)
    assert [m["role"] for m in fitted] == ["user", "assistant", "user"]
    assert fitted[0]["content"] == "S1\n\nS2\n\nU1\n\nU2"
    assert any("folded" in n for n in notes) and any("merged" in n for n in notes)


def test_fit_template_leaves_a_clean_conversation_alone():
    msgs = [{"role": "user", "content": "U"}, {"role": "assistant", "content": "A"}, {"role": "user", "content": "V"}]
    fitted, notes = fit_template(msgs)
    assert fitted == msgs and notes == []


def test_fit_template_opens_with_a_user_turn():
    fitted, notes = fit_template([{"role": "assistant", "content": "A"}, {"role": "user", "content": "U"}])
    assert fitted[0] == {"role": "user", "content": ""} and len(notes) == 1


def test_gemini_gets_a_system_instruction_and_model_turns():
    system, contents = to_gemini(
        [
            {"role": "system", "content": "Be brief."},
            {"role": "user", "content": "Hi"},
            {"role": "user", "content": "there"},
            {"role": "assistant", "content": "Hello."},
            {"role": "user", "content": "Bye"},
        ]
    )
    assert system == "Be brief."
    assert [c["role"] for c in contents] == ["user", "model", "user"]
    assert contents[0]["parts"][0]["text"] == "Hi\n\nthere"
    assert to_gemini([{"role": "user", "content": "x"}])[0] is None
