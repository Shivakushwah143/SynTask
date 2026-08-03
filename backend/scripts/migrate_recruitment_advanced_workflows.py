import asyncio

from beanie import init_beanie
from motor.motor_asyncio import AsyncIOMotorClient

from app.core.config import settings
from app.recruitment.models import (
    CandidateJobScore,
    CandidateSkillExtraction,
    JobRequirementProfile,
    MicrosoftOAuthState,
    MicrosoftRecruitmentConnection,
    Offer,
    OfferAccessToken,
    OfferTemplate,
    RecruitmentEmailDelivery,
    RecruitmentExternalOperation,
    Resume,
    ResumeParsedProfile,
    SkillAlias,
)


async def main() -> None:
    client = AsyncIOMotorClient(settings.MONGODB_URL)
    db = client[settings.DATABASE_NAME]
    await init_beanie(
        database=db,
        document_models=[
            Resume,
            ResumeParsedProfile,
            SkillAlias,
            CandidateSkillExtraction,
            JobRequirementProfile,
            CandidateJobScore,
            Offer,
            OfferTemplate,
            OfferAccessToken,
            MicrosoftRecruitmentConnection,
            MicrosoftOAuthState,
            RecruitmentExternalOperation,
            RecruitmentEmailDelivery,
        ],
    )
    print("Recruitment advanced workflow indexes ensured.")
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
