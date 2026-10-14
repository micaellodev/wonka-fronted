import webauthn
import json
import secrets
from fastapi import Header, HTTPException
from jose import JWTError, jwt
from config import RP_ID, ORIGIN, JWT_SECRET

challenges: dict[str, str] = {}


async def get_current_admin(authorization: str | None = Header(default=None)) -> str:
    """
    FastAPI dependency that verifies the `Authorization: Bearer <token>` header
    against the JWT issued by POST /api/admin/login (admin_login), using the
    same JWT_SECRET/algorithm. Returns the admin id (the token's `sub` claim).

    Raises 401 if the header is missing, malformed, or the token is invalid/expired.
    """
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")

    token = authorization.split(" ", 1)[1].strip()
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    admin_id = payload.get("sub")
    if not admin_id:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    return admin_id

def generate_registration_options(employee_id: str, existing_credentials: list) -> dict:
    exclude_credentials = []
    for cred in existing_credentials:
        exclude_credentials.append(
            webauthn.helpers.structs.PublicKeyCredentialDescriptor(id=cred["credential_id"])
        )

    options = webauthn.generate_registration_options(
        rp_id=RP_ID,
        rp_name="Wonka Asistencia",
        user_name=employee_id,
        user_id=employee_id.encode(),
        attestation=webauthn.helpers.structs.AttestationConveyancePreference.NONE,
        authenticator_selection=webauthn.helpers.structs.AuthenticatorSelectionCriteria(
            resident_key=webauthn.helpers.structs.ResidentKeyRequirement.PREFERRED,
            user_verification=webauthn.helpers.structs.UserVerificationRequirement.REQUIRED,
        ),
        exclude_credentials=exclude_credentials if exclude_credentials else None,
    )
    challenge = options.challenge
    challenges[employee_id] = challenge
    return json.loads(webauthn.options_to_json(options))

def verify_registration(employee_id: str, credential_json: dict) -> dict:
    expected_challenge = challenges.pop(employee_id, None)
    if not expected_challenge:
        raise ValueError("Challenge expired or not found")

    verification = webauthn.verify_registration_response(
        credential=credential_json,
        expected_challenge=expected_challenge,
        expected_rp_id=RP_ID,
        expected_origin=ORIGIN,
    )
    return {
        "credential_id": verification.credential_id,
        "public_key": verification.credential_public_key,
        "sign_count": verification.new_sign_count,
    }

def generate_authentication_options(employee_id: str, credentials: list) -> dict:
    allow_credentials = []
    for cred in credentials:
        allow_credentials.append(
            webauthn.helpers.structs.PublicKeyCredentialDescriptor(id=cred["credential_id"])
        )

    options = webauthn.generate_authentication_options(
        rp_id=RP_ID,
        allow_credentials=allow_credentials if allow_credentials else None,
        user_verification=webauthn.helpers.structs.UserVerificationRequirement.REQUIRED,
    )
    challenge = options.challenge
    challenges[f"auth_{employee_id}"] = challenge
    return json.loads(webauthn.options_to_json(options))

def verify_authentication(employee_id: str, credential_json: dict, stored_credential: dict) -> int:
    expected_challenge = challenges.pop(f"auth_{employee_id}", None)
    if not expected_challenge:
        raise ValueError("Challenge expired or not found")

    verification = webauthn.verify_authentication_response(
        credential=credential_json,
        expected_challenge=expected_challenge,
        expected_rp_id=RP_ID,
        expected_origin=ORIGIN,
        credential_public_key=stored_credential["public_key"],
        credential_current_sign_count=stored_credential["sign_count"],
    )
    # Caller must persist this back onto webauthn_credentials.sign_count to
    # protect against credential cloning (replay/counter-rollback detection).
    return verification.new_sign_count
