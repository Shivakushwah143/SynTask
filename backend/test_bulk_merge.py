"""
Test script for bulk merge functionality
"""
import asyncio
from beanie import init_beanie
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv

load_dotenv()

from app.models.sales_prospect import SalesProspect, InterestLevel, ProspectStatus
from app.models.company import Company
from app.models.user import UserRole
from app.api.v1.endpoints.sales_prospects import bulk_merge_prospects, BulkLeadMergeRequest


class MockUser:
    def __init__(self, user_id, company_id, role):



        
        self.id = user_id
        self.company_id = company_id
        self.role = UserRole[role.upper()] if isinstance(role, str) else role


async def init_db():
    mongo_url = os.getenv("MONGODB_URL", "mongodb://localhost:27017/syntask")
    client = AsyncIOMotorClient(mongo_url)
    db_name = "syntask_test"
    database = client[db_name]
    
    await init_beanie(
        database=database,
        document_models=[SalesProspect, Company]
    )
    print(f"Connected to database: {db_name}")


async def cleanup_test_data(company_id):
    await SalesProspect.find({"company_id": company_id, "prospect_name": {"$regex": "^Test.*"}}).delete()
    print("Cleaned up test data")


async def create_test_company():
    company = Company(name="Test Company", email="test@example.com")
    await company.insert()
    return company


async def create_test_prospects(company, count=5):
    company_id = str(company.id)
    prospects = []
    for i in range(count):
        prospect = SalesProspect(
            first_name=f"Test{i}",
            last_name=f"User{i}",
            prospect_name=f"Test{i} User{i}",
            country_code="+91",
            phone=f"987654321{i}",
            email=f"test{i}@example.com",
            company_id=company_id,
            assigned_to="test_user_id",
            assigned_by="test_user_id",
            current_stage="new",
            status=ProspectStatus.ACTIVE,
            interest_level=InterestLevel.WARM,
            tag=[f"tag{i}"],
            product_ids=[f"product_{i}"],
            company_name="Test Company",
            created_by="test_user_id"
        )
        prospects.append(prospect)
    
    await SalesProspect.insert_many(prospects)
    
    # Fetch the prospects from DB to ensure IDs are populated
    emails = [f"test{i}@example.com" for i in range(count)]
    prospects = await SalesProspect.find({"email": {"$in": emails}}).to_list()
    
    print(f"Created {count} test prospects")
    return prospects


async def test_basic_bulk_merge():
    print("\n" + "="*60)
    print("TEST 1: Basic Bulk Merge (3 source leads)")
    print("="*60)
    
    company = await create_test_company()
    prospects = await create_test_prospects(company, count=4)
    
    target = prospects[0]
    source_ids = [str(p.id) for p in prospects[1:]]
    
    mock_user = MockUser("test_user_id", str(company.id), "admin")
    
    payload = BulkLeadMergeRequest(
        target_lead_id=str(target.id),
        source_lead_ids=source_ids
    )
    
    try:
        result = await bulk_merge_prospects(payload, mock_user)
        
        print(f"\nMerge completed successfully")
        print(f"  - Total requested: {result['summary']['total_requested']}")
        print(f"  - Total merged: {result['summary']['total_merged']}")
        print(f"  - Total failed: {result['summary']['total_failed']}")
        print(f"  - Total skipped: {result['summary']['total_skipped']}")
        
        return True
        
    except Exception as e:
        print(f"\nTest failed with error: {str(e)}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        await cleanup_test_data(str(company.id))


async def test_merge_with_errors():
    print("\n" + "="*60)
    print("TEST 2: Bulk Merge with Errors (Invalid leads)")
    print("="*60)
    
    company = await create_test_company()
    prospects = await create_test_prospects(company, count=3)
    
    target = prospects[0]
    valid_source = prospects[1]
    fake_id = "000000000000000000000000"
    
    mock_user = MockUser("test_user_id", str(company.id), "admin")
    
    payload = BulkLeadMergeRequest(
        target_lead_id=str(target.id),
        source_lead_ids=[
            str(valid_source.id),
            fake_id,
            str(target.id)
        ]
    )
    
    try:
        result = await bulk_merge_prospects(payload, mock_user)
        
        print(f"\nMerge completed with expected errors")
        print(f"  - Total requested: {result['summary']['total_requested']}")
        print(f"  - Total merged: {result['summary']['total_merged']}")
        print(f"  - Total failed: {result['summary']['total_failed']}")
        
        if result['summary']['total_merged'] == 1 and result['summary']['total_failed'] == 2:
            print(f"\nTest passed: Correct number of successes and failures")
            return True
        else:
            print(f"\nTest failed: Expected 1 merge and 2 failures")
            return False
        
    except Exception as e:
        print(f"\nTest failed with error: {str(e)}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        await cleanup_test_data(str(company.id))


async def test_empty_bulk_merge():
    print("\n" + "="*60)
    print("TEST 3: Empty Source List")
    print("="*60)
    
    company = await create_test_company()
    prospect = SalesProspect(
        first_name="Test",
        last_name="User",
        prospect_name="Test User",
        country_code="+91",
        phone="9876543210",
        company_id=str(company.id),
        assigned_to="test_user_id",
        assigned_by="test_user_id",
        current_stage="new",
        status=ProspectStatus.ACTIVE,
        created_by="test_user_id"
    )
    await prospect.insert()
    
    # Fetch to ensure ID is populated
    prospect = await SalesProspect.find_one({"phone": "9876543210"})
    
    mock_user = MockUser("test_user_id", str(company.id), "admin")
    
    payload = BulkLeadMergeRequest(
        target_lead_id=str(prospect.id),
        source_lead_ids=[]
    )
    
    try:
        result = await bulk_merge_prospects(payload, mock_user)
        
        print(f"\nEmpty merge handled correctly")
        print(f"  - Total merged: {result['summary']['total_merged']}")
        
        if result['summary']['total_merged'] == 0:
            print(f"Test passed: No merges performed")
            return True
        else:
            print(f"Test failed: Expected 0 merges")
            return False
        
    except Exception as e:
        print(f"\nTest failed with error: {str(e)}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        await cleanup_test_data(str(company.id))


async def test_large_bulk_merge():
    print("\n" + "="*60)
    print("TEST 4: Large Bulk Merge (10 source leads)")
    print("="*60)
    
    company = await create_test_company()
    prospects = await create_test_prospects(company, count=11)
    
    target = prospects[0]
    source_ids = [str(p.id) for p in prospects[1:]]
    
    mock_user = MockUser("test_user_id", str(company.id), "admin")
    
    payload = BulkLeadMergeRequest(
        target_lead_id=str(target.id),
        source_lead_ids=source_ids
    )
    
    try:
        result = await bulk_merge_prospects(payload, mock_user)
        
        print(f"\nLarge merge completed")
        print(f"  - Total requested: {result['summary']['total_requested']}")
        print(f"  - Total merged: {result['summary']['total_merged']}")
        
        if result['summary']['total_merged'] == 10:
            print(f"Test passed: All 10 leads merged successfully")
            return True
        else:
            print(f"Test failed: Expected 10 merges, got {result['summary']['total_merged']}")
            return False
        
    except Exception as e:
        print(f"\nTest failed with error: {str(e)}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        await cleanup_test_data(str(company.id))


async def main():
    print("\n" + "="*60)
    print("BULK MERGE ENDPOINT - TEST SUITE")
    print("="*60)
    
    try:
        await init_db()
        
        tests = [
            ("Basic Bulk Merge", test_basic_bulk_merge),
            ("Merge with Errors", test_merge_with_errors),
            ("Empty Source List", test_empty_bulk_merge),
            ("Large Bulk Merge", test_large_bulk_merge),
        ]
        
        results = []
        for test_name, test_func in tests:
            try:
                passed = await test_func()
                results.append((test_name, passed))
            except Exception as e:
                print(f"\n{test_name} crashed: {str(e)}")
                results.append((test_name, False))
        
        print("\n" + "="*60)
        print("TEST SUMMARY")
        print("="*60)
        
        passed = sum(1 for _, p in results if p)
        total = len(results)
        
        for test_name, test_passed in results:
            status = "PASSED" if test_passed else "FAILED"
            print(f"{status}: {test_name}")
        
        print(f"\nTotal: {passed}/{total} tests passed")
        
    except Exception as e:
        print(f"\nTest suite failed: {str(e)}")
        import traceback
        traceback.print_exc()
    finally:
        print("\n" + "="*60)
        print("Test suite completed")
        print("="*60 + "\n")


if __name__ == "__main__":
    asyncio.run(main())