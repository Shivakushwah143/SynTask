from datetime import datetime, timezone


def test_transformer_maps_graph_field_data_and_meta_attribution():
    from app.integrations.meta.transformers import transform_meta_lead

    result = transform_meta_lead({
        "id": "lead-1",
        "created_time": "2026-07-20T10:30:00+0000",
        "ad_id": "ad-1",
        "adset_id": "adset-1",
        "campaign_id": "campaign-1",
        "form_id": "form-1",
        "field_data": [
            {"name": "full_name", "values": ["Ada Lovelace"]},
            {"name": "email", "values": ["ada@example.com"]},
            {"name": "phone_number", "values": ["+44 20 7946 0958"]},
            {"name": "consent", "values": ["true"]},
        ],
    })

    assert result["first_name"] == "Ada"
    assert result["last_name"] == "Lovelace"
    assert result["prospect_name"] == "Ada Lovelace"
    assert result["country_code"] == "+44"
    assert result["phone"] == "2079460958"
    assert result["meta_lead_id"] == "lead-1"
    assert result["meta_campaign_id"] == "campaign-1"
    assert result["meta_consent"] is True
    assert result["meta_created_time"] == datetime(2026, 7, 20, 10, 30, tzinfo=timezone.utc)
    assert result["meta_attribution"] == {
        "campaign_id": "campaign-1", "adset_id": "adset-1", "ad_id": "ad-1", "form_id": "form-1"
    }


def test_transformer_leaves_missing_phone_empty_for_quarantine():
    from app.integrations.meta.transformers import transform_meta_lead

    result = transform_meta_lead({"id": "lead-1", "field_data": [{"name": "full_name", "values": ["Ada"]}]})

    assert result["phone"] is None


def test_transformer_does_not_invent_a_country_code_for_an_unprefixed_phone():
    from app.integrations.meta.transformers import transform_meta_lead

    result = transform_meta_lead({
        "id": "lead-1",
        "field_data": [
            {"name": "full_name", "values": ["Ada Lovelace"]},
            {"name": "phone_number", "values": ["555-1234"]},
        ],
    })

    assert result["country_code"] is None
    assert result["phone"] == "5551234"


def test_transformer_preserves_missing_and_single_name_values_without_placeholders():
    from app.integrations.meta.transformers import transform_meta_lead

    single_name = transform_meta_lead({
        "id": "lead-1",
        "field_data": [{"name": "full_name", "values": ["Cher"]}],
    })
    missing_name = transform_meta_lead({"id": "lead-2", "field_data": []})

    assert single_name["first_name"] == "Cher"
    assert single_name["last_name"] is None
    assert single_name["prospect_name"] == "Cher"
    assert missing_name["first_name"] is None
    assert missing_name["last_name"] is None
    assert missing_name["prospect_name"] is None
