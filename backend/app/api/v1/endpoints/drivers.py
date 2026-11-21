from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
from app.core.database import get_db
from app.models.driver import Driver
from app.models.device import Device
from app.schemas.driver import DriverCreate, DriverOut, DriverUpdate

router = APIRouter(prefix="/drivers", tags=["Drivers"])


@router.post("", response_model=DriverOut)
async def create_driver(driver_in: DriverCreate, db: AsyncSession = Depends(get_db)):
    # Vérifier l'unicité du téléphone
    res = await db.execute(select(Driver).where(Driver.phone_number == driver_in.phone_number))
    if res.scalars().first():
        raise HTTPException(status_code=400, detail="Un conducteur avec ce numéro existe déjà.")
    
    driver = Driver(**driver_in.model_dump())
    db.add(driver)
    await db.commit()
    await db.refresh(driver)
    return driver


@router.get("", response_model=List[DriverOut])
async def list_drivers(
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Driver).offset(skip).limit(limit).order_by(Driver.id.asc()))
    return result.scalars().all()


@router.get("/{driver_id}", response_model=DriverOut)
async def get_driver(driver_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Driver).where(Driver.id == driver_id))
    driver = result.scalars().first()
    if not driver:
        raise HTTPException(status_code=404, detail="Conducteur non trouvé.")
    return driver


@router.patch("/{driver_id}", response_model=DriverOut)
async def update_driver(driver_id: int, update_in: DriverUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Driver).where(Driver.id == driver_id))
    driver = result.scalars().first()
    if not driver:
        raise HTTPException(status_code=404, detail="Conducteur non trouvé.")
    
    update_data = update_in.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(driver, key, value)
    
    await db.commit()
    await db.refresh(driver)
    return driver


@router.delete("/{driver_id}")
async def delete_driver(driver_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Driver).where(Driver.id == driver_id))
    driver = result.scalars().first()
    if not driver:
        raise HTTPException(status_code=404, detail="Conducteur non trouvé.")
    
    # Dissocier les appareils liés
    dev_res = await db.execute(select(Device).where(Device.driver_id == driver_id))
    for dev in dev_res.scalars().all():
        dev.driver_id = None
    
    await db.delete(driver)
    await db.commit()
    return {"status": "success", "message": f"Conducteur {driver_id} supprimé."}
